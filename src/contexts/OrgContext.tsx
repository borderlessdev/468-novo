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
      if (isPlatformAdmin) {
        if (orgId) localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, orgId)
        else localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY)
      }
    },
    [isPlatformAdmin],
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
        const stored = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)
        const resolvedOrgId =
          stored && orgs.some((org) => org.id === stored) ? stored : null
        setActiveOrgIdState(resolvedOrgId)
        if (resolvedOrgId) {
          setActiveOrg(orgs.find((org) => org.id === resolvedOrgId) ?? null)
        } else {
          setActiveOrg(null)
        }
        setMembership(null)
        return
      }

      const member =
        (profile?.orgId
          ? await getMemberByUid(user.uid)
          : null) ?? (await getMemberByUid(user.uid))

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
