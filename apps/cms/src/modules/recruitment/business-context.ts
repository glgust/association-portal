import type { Access } from 'payload'

export const recruitmentBusinessOperations = {
  approveApplication: 'recruitment.approve-application',
  publishForm: 'recruitment.publish-form',
  submitApplication: 'recruitment.submit-application',
} as const

export type RecruitmentBusinessOperation =
  (typeof recruitmentBusinessOperations)[keyof typeof recruitmentBusinessOperations]

export function setRecruitmentBusinessOperation(
  context: Record<string, unknown>,
  operation: RecruitmentBusinessOperation,
): void {
  context.recruitmentBusinessOperation = operation
}

export function allowsRecruitmentOperation(
  ...operations: RecruitmentBusinessOperation[]
): Access {
  return ({ req }) =>
    operations.includes(req.context.recruitmentBusinessOperation as never)
}
