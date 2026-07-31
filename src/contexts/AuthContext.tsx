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
import { createUserProfile, getUserProfile, updateUserNotificationPreferences, updateUserProfile } from '@/services/users'
import { acceptInvite } from '@/services/invites'
import type { UserProfile, UserRole } from '@/types'
import type { NotificationPreferences } from '@/lib/notificationPreferences'
import { getAuthErrorMessage } from '@/lib/utils'

interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  isAdmin: boolean
  role: UserRole
  isClient: boolean
  canWrite: boolean
  login: (email: string, password: string) => Promise<void>
  register: (
    name: string,
    email: string,
    password: string,
    options?: { role?: UserRole; inviteId?: string },
  ) => Promise<void>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  refreshProfile: () => Promise<void>
  updateProfileData: (data: { name: string; photoURL?: string }) => Promise<void>
  updateNotificationPreferences: (
    preferences: import('@/lib/notificationPreferences').NotificationPreferences,
  ) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  const loadProfile = useCallback(async (firebaseUser: User) => {
    let userProfile = await getUserProfile(firebaseUser.uid)
    if (!userProfile) {
      await createUserProfile({
        uid: firebaseUser.uid,
        name: firebaseUser.displayName ?? 'Usuário',
        email: firebaseUser.email ?? '',
        photoURL: firebaseUser.photoURL ?? undefined,
      })
      userProfile = await getUserProfile(firebaseUser.uid)
    }
    setProfile(userProfile)

    const token = await firebaseUser.getIdTokenResult(true)
    // Fonte de verdade: só Custom Claim. Nunca confiar em users.role para queries privilegiadas.
    setIsAdmin(token.claims.admin === true)
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
          }
        } else {
          setProfile(null)
          setIsAdmin(false)
        }
        setLoading(false)
      })()
    })
    return unsubscribe
  }, [loadProfile])

  const login = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (error) {
      const code = (error as { code?: string }).code ?? ''
      throw new Error(getAuthErrorMessage(code))
    }
  }, [])

  const register = useCallback(
    async (
      name: string,
      email: string,
      password: string,
      options?: { role?: UserRole; inviteId?: string },
    ) => {
      try {
        const credential = await createUserWithEmailAndPassword(auth, email, password)
        await updateProfile(credential.user, { displayName: name })
        await createUserProfile({
          uid: credential.user.uid,
          name,
          email,
          role: options?.role ?? 'user',
        })
        if (options?.inviteId) {
          await acceptInvite(options.inviteId, credential.user.uid)
        }
      } catch (error) {
        const code = (error as { code?: string }).code ?? ''
        throw new Error(getAuthErrorMessage(code))
      }
    },
    [],
  )

  const logout = useCallback(async () => {
    await signOut(auth)
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    try {
      const normalizedEmail = email.trim().toLowerCase()
      auth.languageCode = 'pt'
      await sendPasswordResetEmail(auth, normalizedEmail, {
        url: `${window.location.origin}/login`,
        handleCodeInApp: false,
      })
    } catch (error) {
      const code = (error as { code?: string }).code ?? ''
      throw new Error(getAuthErrorMessage(code))
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!user) return
    await loadProfile(user)
  }, [loadProfile, user])

  const updateProfileData = useCallback(
    async (data: { name: string; photoURL?: string }) => {
      if (!user) return
      await updateProfile(user, {
        displayName: data.name,
        photoURL: data.photoURL || null,
      })
      await updateUserProfile(user.uid, {
        name: data.name,
        photoURL: data.photoURL || undefined,
      })
      await refreshProfile()
    },
    [refreshProfile, user],
  )

  const updateNotificationPreferences = useCallback(
    async (preferences: NotificationPreferences) => {
      if (!user) return
      await updateUserNotificationPreferences(user.uid, preferences)
      await refreshProfile()
    },
    [refreshProfile, user],
  )

  const role: UserRole = isAdmin ? 'admin' : (profile?.role ?? 'user')
  const isClient = role === 'client'
  const canWrite = canWriteOperations(role, isAdmin)

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      isAdmin,
      role,
      isClient,
      canWrite,
      login,
      register,
      logout,
      resetPassword,
      refreshProfile,
      updateProfileData,
      updateNotificationPreferences,
    }),
    [
      user,
      profile,
      loading,
      isAdmin,
      role,
      isClient,
      canWrite,
      login,
      register,
      logout,
      resetPassword,
      refreshProfile,
      updateProfileData,
      updateNotificationPreferences,
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
