import { DynamicApplicationForm } from './DynamicApplicationForm'

export default async function JoinPage({
  params,
}: {
  params: Promise<{ cycleId: string }>
}) {
  const { cycleId } = await params
  return (
    <main style={{ margin: '0 auto', maxWidth: 720, padding: '3rem 1.5rem' }}>
      <h1>协会预报名 Demo</h1>
      <p>
        提交前请确认用途说明和隐私提示；当前页面仅用于验证动态表单与业务边界。
      </p>
      <DynamicApplicationForm cycleId={cycleId} />
    </main>
  )
}
