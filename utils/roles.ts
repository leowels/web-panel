export type RoleName = 'admin' | 'manager' | 'inspector' | 'operator' | 'auditor' | 'viewer'

type UserLike = {
  roles?: { name: string }[] | null
} | null

export const getRoleNames = (user: UserLike): RoleName[] => {
  const raw = user?.roles?.map((r) => r.name).filter(Boolean) || []
  return raw as RoleName[]
}

export const hasAnyRole = (user: UserLike, roles: RoleName[]) => {
  const roleNames = getRoleNames(user)
  return roles.some((r) => roleNames.includes(r))
}

export const isManagerOnly = (user: UserLike) => {
  const roleNames = getRoleNames(user)
  return roleNames.includes('manager') && !roleNames.includes('admin')
}

export const canMutateData = (user: UserLike) => {
  return hasAnyRole(user, ['admin', 'inspector', 'operator'])
}

export const isViewerOnly = (user: UserLike) => {
  const roleNames = getRoleNames(user)
  return roleNames.includes('viewer') && !canMutateData(user)
}
