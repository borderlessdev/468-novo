import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { canWriteOperations } from '@/lib/access'
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/org'
import {
  getMemberByUid,
  getOrganization,
  getOrganizationMember,
  listOrganizations,
} from '@/services/organizations'
import type { Organization, OrganizationMember } from '@/types'

interface OrgContextValue {
  loading: boolean
  activeOrgId: string | null
  activeOrg: Organization | null
  membership: OrganizationMember | null
  isOrgAdmin: boolean
  organizations: Organization[]
  setActiveOrgId: (orgId: string | null) => void
  refreshOrg: () => Promise<void>
  canWrite: boolean
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined)

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user, profile, loading: authLoading, isPlatformAdmin } = useAuth()
  const [loading, setLoading] = useState(true)
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null)
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null)
  const [membership, setMembership] = useState<OrganizationMember | null>(null)
  const [organizations, setOrganizations] = useState<Organization[]>([])

  const setActiveOrgId = useCallback(
    (orgId: string | null) => {
      setActiveOrgIdState(orgId)
      if (!isPlatformAdmin) return

      if (orgId) {
        localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, orgId)
        const cached = organizations.find((org) => org.id === orgId)
        if (cached) {
          setActiveOrg(cached)
          return
        }
        void getOrganization(orgId).then((org) => {
          // Evita aplicar resultado atrasado se o usuário já trocou de pasta.
          if (localStorage.getItem(ACTIVE_ORG_STORAGE_KEY) !== orgId) return
          setActiveOrg(org)
        })
      } else {
        localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY)
        setActiveOrg(null)
      }
    },
    [isPlatformAdmin, organizations],
  )

  const refreshOrg = useCallback(async () => {
    if (!user) {
      setOrganizations([])
      setActiveOrg(null)
      setMembership(null)
      setActiveOrgIdState(null)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      if (isPlatformAdmin) {
        const orgs = await listOrganizations()
        setOrganizations(orgs)
        // Releia o storage no momento de aplicar o estado para não sobrescrever
        // um "Entrar no sistema" feito durante o await de listOrganizations.
        const stored = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)
        const resolvedOrgId =
          stored && orgs.some((org) => org.id === stored) ? stored : null
        setActiveOrgIdState((current) => {
          const latest = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)
          if (latest && orgs.some((org) => org.id === latest)) return latest
          if (current && orgs.some((org) => org.id === current)) return current
          return resolvedOrgId
        })
        const latest = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)
        const activeId =
          latest && orgs.some((org) => org.id === latest) ? latest : null
        setActiveOrg(activeId ? (orgs.find((org) => org.id === activeId) ?? null) : null)
        setMembership(null)
        return
      }

      const member = profile?.orgId
        ? await getOrganizationMember(profile.orgId, user.uid)
        : await getMemberByUid(user.uid)

      if (member) {
        const org = await getOrganization(member.orgId)
        setMembership(member)
        setActiveOrgIdState(member.orgId)
        setActiveOrg(org)
        setOrganizations(org ? [org] : [])
      } else if (profile?.orgId) {
        const org = await getOrganization(profile.orgId)
        setMembership(null)
        setActiveOrgIdState(profile.orgId)
        setActiveOrg(org)
        setOrganizations(org ? [org] : [])
      } else {
        setMembership(null)
        setActiveOrgIdState(null)
        setActiveOrg(null)
        setOrganizations([])
      }
    } finally {
      setLoading(false)
    }
  }, [isPlatformAdmin, profile?.orgId, user])

  useEffect(() => {
    if (authLoading) return
    void refreshOrg()
  }, [authLoading, refreshOrg])

  const isOrgAdmin =
    isPlatformAdmin || membership?.orgRole === 'org_admin'

  const canWrite = canWriteOperations(
    profile?.role ?? 'user',
    isPlatformAdmin || membership?.orgRole === 'org_admin',
  )

  const value = useMemo(
    () => ({
      loading: authLoading || loading,
      activeOrgId,
      activeOrg,
      membership,
      isOrgAdmin,
      organizations,
      setActiveOrgId,
      refreshOrg,
      canWrite,
    }),
    [
      authLoading,
      loading,
      activeOrgId,
      activeOrg,
      membership,
      isOrgAdmin,
      organizations,
      setActiveOrgId,
      refreshOrg,
      canWrite,
    ],
  )

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export function useOrg() {
  const context = useContext(OrgContext)
  if (!context) {
    throw new Error('useOrg deve ser usado dentro de OrgProvider')
  }
  return context
}

export function useRequiredOrgId(): string {
  const { activeOrgId, loading } = useOrg()
  if (loading) return ''
  return activeOrgId ?? ''
}
