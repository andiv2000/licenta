import type { User } from '../store'

export function isGlobalAdmin(user: User | null | undefined): boolean {
  if (!user) return false
  if (user.is_global_admin !== undefined) return user.is_global_admin
  return user.role === 'admin' && !user.faculty
}

export function isFacultyAdmin(user: User | null | undefined): boolean {
  if (!user) return false
  if (user.is_faculty_admin !== undefined) return user.is_faculty_admin
  return user.role === 'admin' && !!user.faculty
}

export function canManageAnswerKeys(user: User | null | undefined): boolean {
  if (!user) return false
  if (user.can_manage_answer_keys !== undefined) return user.can_manage_answer_keys
  return user.role === 'admin'
}

export function canCorrect(user: User | null | undefined): boolean {
  if (!user) return false
  if (user.can_correct !== undefined) return user.can_correct
  return isGlobalAdmin(user) || !!user.faculty
}

export function hasFacultyBinding(user: User | null | undefined): boolean {
  return !!user?.faculty
}
