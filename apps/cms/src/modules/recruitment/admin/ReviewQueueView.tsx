import type { AdminViewServerProps } from 'payload'

import { authorize } from '@/modules/authorization/authorize'
import { loadActor } from '@/modules/authorization/load-actor'
import { AdminPageContext } from '@/modules/admin-experience/AdminPageContext'
import { interpretAnswers } from '@/modules/recruitment/form-schema/answers'

import { ApproveButton } from './ApproveButton'

export async function ReviewQueueView(props: AdminViewServerProps) {
  const req = props.initPageResult.req
  const actor = await loadActor(req.payload, req)
  const applications = actor
    ? await req.payload.find({
        collection: 'membership-applications',
        depth: 1,
        limit: 20,
        overrideAccess: false,
        req,
        sort: 'submittedAt',
        where: { status: { equals: 'pending' } },
      })
    : null

  return (
    <>
      <AdminPageContext group="历史与 Demo" title="入会申请审核 Demo" />
      <div style={{ margin: '0 auto', maxWidth: 960, padding: '2rem' }}>
        <h1>入会申请审核 Demo</h1>
        <p>该页面复用 Payload 登录与后台壳；审核操作只调用版本化业务 API。</p>
        {!actor ? <p>需要登录。</p> : null}
        {actor && applications?.docs.length === 0 ? (
          <p>当前没有待处理申请。</p>
        ) : null}
        {applications?.docs.map((application) => {
          const cycleId =
            typeof application.recruitmentCycle === 'string'
              ? application.recruitmentCycle
              : application.recruitmentCycle.id
          const formVersion = application.formVersion
          if (typeof formVersion === 'string') return null
          const decision = authorize(
            actor!,
            'recruitment.application.review',
            { recruitmentCycleId: cycleId, type: 'recruitmentCycle' },
            new Date(),
          )
          const answers = interpretAnswers(
            formVersion.schema,
            application.answers as Record<string, unknown>,
          )

          return (
            <article
              key={application.id}
              style={{
                border: '1px solid var(--theme-elevation-150)',
                marginTop: 16,
                padding: 16,
              }}
            >
              <h2>申请 {application.id}</h2>
              <dl>
                {answers.map((answer) => (
                  <div key={answer.fieldId}>
                    <dt>{answer.label}</dt>
                    <dd>{answer.displayValue}</dd>
                  </div>
                ))}
              </dl>
              {decision.allowed ? (
                <ApproveButton
                  applicationId={application.id}
                  expectedVersion={application.recordVersion}
                />
              ) : (
                <p>当前账号没有审核权限（{decision.reason}）。</p>
              )}
            </article>
          )
        })}
      </div>
    </>
  )
}
