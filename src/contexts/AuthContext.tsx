import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { auth, initAnalytics } from '@/lib/firebase'
import { canWriteOperations } from '@/lib/access'
import { createUserProfile, getUserProfile, updateUserEmailNotificationPreferences, updateUserNotificationPreferences, updateUserProfile } from '@/services/users'
import { removeProfilePhoto, uploadProfilePhoto } from '@/services/profilePhoto'
import { joinOrganizationFromInvite } from '@/services/invites'
import { addOrganizationMember } from '@/services/organizations'
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/org'
import type { UserProfile, UserRole } from '@/types'
import type { NotificationPreferences } from '@/lib/notificationPreferences'
import { getAuthErrorMessage } from '@/lib/utils'

interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  isAdmin: boolean
  isPlatformAdmin: boolean
  role: UserRole
  isClient: boolean
  canWrite: boolean
  login: (email: string, password: string) => Promise<void>
  register: (
    name: string,
    email: string,
    password: string,
    options?: {
      role?: UserRole
      inviteToken?: string
      orgId?: string
      orgRole?: import('@/types').OrgRole
      department?: string
    },
  ) => Promise<void>
  /** Vincula a conta logada a uma empresa a partir do token do convite. */
  acceptInviteLink: (token: string) => Promise<void>
  logout: () => Promise<void>
  resetPassword: (
    email: string,
    options?: { continueUrl?: string },
  ) => Promise<void>
  refreshProfile: () => Promise<void>
  updateProfileData: (data: { name: string; photoURL?: string }) => Promise<void>
  uploadAvatar: (file: File) => Promise<void>
  removeAvatar: () => Promise<void>
  updateNotificationPreferences: (
    preferences: import('@/lib/notificationPreferences').NotificationPreferences,
  ) => Promise<void>
  updateEmailNotificationPreferences: (
    preferences: import('@/lib/notificationPreferences').NotificationPreferences,
  ) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)

  const loadProfile = useCallback(async (firebaseUser: User) => {
    let userProfile = await getUserProfile(firebaseUser.uid)
    // Evita corrida com register(): o onAuthStateChanged pode rodar antes do
    // createUserProfile com orgId/convite. Aguarda e tenta de novo.
    if (!userProfile) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      userProfile = await getUserProfile(firebaseUser.uid)
    }
    if (!userProfile) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      userProfile = await getUserProfile(firebaseUser.uid)
    }
    if (!userProfile) {
      // Placeholder mínimo — sem orgId:null forçado (merge preserva vínculo).
      await createUserProfile({
        uid: firebaseUser.uid,
        name: firebaseUser.displayName ?? 'Usuário',
        email: firebaseUser.email ?? '',
        photoURL: firebaseUser.photoURL ?? undefined,
      })
      userProfile = await getUserProfile(firebaseUser.uid)
    } else if (!userProfile.orgId) {
      // register() ainda pode estar gravando orgId — releituras ajudam.
      for (let attempt = 0; attempt < 3 && !userProfile.orgId; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 400))
        userProfile = (await getUserProfile(firebaseUser.uid)) ?? userProfile
      }
    }
    setProfile(userProfile)

    const token = await firebaseUser.getIdTokenResult(true)
    const platformAdmin =
      token.claims.admin === true || token.claims.platformAdmin === true
    setIsPlatformAdmin(platformAdmin)
    setIsAdmin(platformAdmin)
  }, [])

  useEffect(() => {
    // Analytics só se habilitado explicitamente (evita ERR_SSL em redes que bloqueiam gtag)
    if (import.meta.env.VITE_ENABLE_ANALYTICS === 'true') {
      void initAnalytics()
    }
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      void (async () => {
        setUser(firebaseUser)
        if (firebaseUser) {
          try {
            await loadProfile(firebaseUser)
          } catch (error) {
            console.error(error)
            setProfile(null)
            setIsAdmin(false)
            setIsPlatformAdmin(false)
          }
        } else {
          setProfile(null)
          setIsAdmin(false)
          setIsPlatformAdmin(false)
        }
        setLoading(false)
      })()
    })
    return unsubscribe
  }, [loadProfile])

  const login = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
    } catch (error) {
      const code = (error as { code?: string }).code ?? ''
      throw new Error(getAuthErrorMessage(code))
    }
  }, [])

  const joinExistingAccountWithInvite = useCallback(
    async (input: { email: string; password: string; inviteToken: string; name?: string }) => {
      const email = input.email.trim().toLowerCase()
      try {
        await signInWithEmailAndPassword(auth, email, input.password)
      } catch (signInError) {
        const signInCode = (signInError as { code?: string }).code ?? ''
        if (signInCode === 'auth/wrong-password' || signInCode === 'auth/invalid-credential') {
          throw new Error(
            'Este e-mail já tem conta. Entre com a senha atual ou use “Esqueceu a senha?” — o convite será mantido.',
          )
        }
        throw new Error(getAuthErrorMessage(signInCode) || 'Não foi possível entrar na conta existente.')
      }
      const firebaseUser = auth.currentUser
      if (!firebaseUser) {
        throw new Error('Faça login para aceitar o convite')
      }
      await joinOrganizationFromInvite({
        token: input.inviteToken,
        name: input.name?.trim() || firebaseUser.displayName || email,
      })
      await loadProfile(firebaseUser)
    },
    [loadProfile],
  )

  const register = useCallback(
    async (
      name: string,
      email: string,
      password: string,
      options?: {
        role?: UserRole
        inviteToken?: string
        orgId?: string
        orgRole?: import('@/types').OrgRole
        department?: string
      },
    ) => {
      try {
        const normalizedEmail = email.trim().toLowerCase()
        const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password)
        await updateProfile(credential.user, { displayName: name })
        let orgId = options?.orgId
        let orgRole = options?.orgRole
        let department = options?.department
        let role = options?.role ?? 'user'

        if (options?.inviteToken) {
          await joinOrganizationFromInvite({
            token: options.inviteToken,
            name,
          })
          await loadProfile(credential.user)
          return
        }

        await createUserProfile({
          uid: credential.user.uid,
          name,
          email: normalizedEmail,
          role,
          orgId,
        })

        if (orgId && orgRole) {
          await addOrganizationMember({
            orgId,
            uid: credential.user.uid,
            email: normalizedEmail,
            name,
            orgRole,
            department,
          })
        }

        // Garante profile/org no estado após corrida com onAuthStateChanged
        await loadProfile(credential.user)
      } catch (error) {
        const code = (error as { code?: string }).code ?? ''
        if (code === 'auth/email-already-in-use' && options?.inviteToken) {
          await joinExistingAccountWithInvite({
            email: email.trim().toLowerCase(),
            password,
            inviteToken: options.inviteToken,
            name,
          })
          return
        }
        throw new Error(getAuthErrorMessage(code) || (error instanceof Error ? error.message : 'Falha no cadastro'))
      }
    },
    [joinExistingAccountWithInvite, loadProfile],
  )

  const acceptInviteLink = useCallback(
    async (token: string) => {
      const firebaseUser = auth.currentUser
      if (!firebaseUser?.email) {
        throw new Error('Faça login para aceitar o convite')
      }
      const joined = await joinOrganizationFromInvite({
        token: token.trim(),
        name: firebaseUser.displayName ?? undefined,
      })
      try {
        localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, joined.orgId)
      } catch {
        // ignore
      }
      await loadProfile(firebaseUser)
    },
    [loadProfile],
  )

  const logout = useCallback(async () => {
    try {
      localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY)
      sessionStorage.removeItem('pe-help-chat-v1')
    } catch {
      // ignore
    }
    await signOut(auth)
  }, [])

  const resetPassword = useCallback(
    async (email: string, options?: { continueUrl?: string }) => {
      try {
        const normalizedEmail = email.trim().toLowerCase()
        auth.languageCode = 'pt'
        await sendPasswordResetEmail(auth, normalizedEmail, {
          url: options?.continueUrl ?? `${window.location.origin}/login`,
          handleCodeInApp: false,
        })
      } catch (error) {
        const code = (error as { code?: string }).code ?? ''
        throw new Error(getAuthErrorMessage(code))
      }
    },
    [],
  )

  const refreshProfile = useCallback(async () => {
    if (!user) return
    await loadProfile(user)
  }, [loadProfile, user])

  const updateProfileData = useCallback(
    async (data: { name: string; photoURL?: string }) => {
      if (!user) return
      await updateProfile(user, {
        displayName: data.name,
        ...(data.photoURL !== undefined
          ? { photoURL: data.photoURL || null }
          : {}),
      })
      await updateUserProfile(user.uid, {
        name: data.name,
        ...(data.photoURL !== undefined
          ? { photoURL: data.photoURL || undefined }
          : {}),
      })
      await refreshProfile()
    },
    [refreshProfile, user],
  )

  const uploadAvatar = useCallback(
    async (file: File) => {
      if (!user) return
      const { photoURL } = await uploadProfilePhoto(user.uid, file)
      try {
        await updateProfile(user, { photoURL })
      } catch (error) {
        console.warn('Auth photoURL update failed', error)
      }
      await refreshProfile()
    },
    [refreshProfile, user],
  )

  const removeAvatar = useCallback(async () => {
    if (!user) return
    await removeProfilePhoto(user.uid)
    try {
      await updateProfile(user, { photoURL: null })
    } catch (error) {
      console.warn('Auth photoURL clear failed', error)
    }
    await refreshProfile()
  }, [refreshProfile, user])

  const updateNotificationPreferences = useCallback(
    async (preferences: NotificationPreferences) => {
      if (!user) return
      await updateUserNotificationPreferences(user.uid, preferences)
      await refreshProfile()
    },
    [refreshProfile, user],
  )

  const updateEmailNotificationPreferences = useCallback(
    async (preferences: NotificationPreferences) => {
      if (!user) return
      await updateUserEmailNotificationPreferences(user.uid, preferences)
      await refreshProfile()
    },
    [refreshProfile, user],
  )

  const role: UserRole = isPlatformAdmin ? 'admin' : (profile?.role ?? 'user')
  const isClient = role === 'client'
  const canWrite = canWriteOperations(role, isPlatformAdmin)

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      isAdmin,
      isPlatformAdmin,
      role,
      isClient,
      canWrite,
      login,
      register,
      acceptInviteLink,
      logout,
      resetPassword,
      refreshProfile,
      updateProfileData,
      uploadAvatar,
      removeAvatar,
      updateNotificationPreferences,
      updateEmailNotificationPreferences,
    }),
    [
      user,
      profile,
      loading,
      isAdmin,
      isPlatformAdmin,
      role,
      isClient,
      canWrite,
      login,
      register,
      acceptInviteLink,
      logout,
      resetPassword,
      refreshProfile,
      updateProfileData,
      uploadAvatar,
      removeAvatar,
      updateNotificationPreferences,
      updateEmailNotificationPreferences,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider')
  }
  return context
}
