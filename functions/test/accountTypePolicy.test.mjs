import assert from 'node:assert/strict'
import { decideAccountTypeChange } from '../lib/accountTypePolicy.js'

function decide(overrides) {
  return decideAccountTypeChange({
    callerIsMaster: true,
    targetExists: true,
    targetIsMaster: false,
    otherMasterCount: 1,
    currentType: 'team',
    nextType: 'org_admin',
    hasOrganizationLink: true,
    ...overrides,
  })
}

const employeeBlocked = decide({ callerIsMaster: false, nextType: 'admin_master' })
assert.equal(employeeBlocked.ok, false)
assert.equal(employeeBlocked.code, 'permission-denied')

const orgAdminBlocked = decide({
  callerIsMaster: false,
  currentType: 'team',
  nextType: 'org_admin',
})
assert.equal(orgAdminBlocked.ok, false)
assert.equal(orgAdminBlocked.code, 'permission-denied')

const promoteEmployee = decide({ currentType: 'team', nextType: 'org_admin' })
assert.equal(promoteEmployee.ok, true)
assert.equal(promoteEmployee.profileRole, 'user')
assert.equal(promoteEmployee.orgRole, 'org_admin')
assert.equal(promoteEmployee.claims, 'keep')

const toClient = decide({ currentType: 'org_admin', nextType: 'client' })
assert.equal(toClient.ok, true)
assert.equal(toClient.profileRole, 'client')
assert.equal(toClient.orgRole, 'client')

const toMaster = decide({ currentType: 'team', nextType: 'admin_master' })
assert.equal(toMaster.ok, true)
assert.equal(toMaster.profileRole, 'admin')
assert.equal(toMaster.orgRole, null)
assert.equal(toMaster.claims, 'grant')

const demoteMaster = decide({
  targetIsMaster: true,
  currentType: 'admin_master',
  nextType: 'org_admin',
  otherMasterCount: 1,
})
assert.equal(demoteMaster.ok, true)
assert.equal(demoteMaster.claims, 'revoke')
assert.equal(demoteMaster.orgRole, 'org_admin')

const lastMaster = decide({
  targetIsMaster: true,
  currentType: 'admin_master',
  nextType: 'team',
  otherMasterCount: 0,
})
assert.equal(lastMaster.ok, false)
assert.equal(lastMaster.code, 'failed-precondition')
assert.match(lastMaster.message, /administrador master/)

const missingLink = decide({
  currentType: 'admin_master',
  nextType: 'team',
  targetIsMaster: true,
  otherMasterCount: 2,
  hasOrganizationLink: false,
})
assert.equal(missingLink.ok, false)
assert.match(missingLink.message, /vinculado a uma empresa/)

const unchanged = decide({ currentType: 'team', nextType: 'team' })
assert.equal(unchanged.ok, true)
assert.equal(unchanged.unchanged, true)
assert.equal(unchanged.orgRole, null)

const missingUser = decide({ targetExists: false })
assert.equal(missingUser.ok, false)
assert.equal(missingUser.code, 'not-found')

console.log('accountTypePolicy: 10 cenários ok')
