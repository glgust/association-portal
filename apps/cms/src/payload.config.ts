import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig, defaultLoggerOptions } from 'payload'
import { zh } from 'payload/i18n/zh'
import sharp from 'sharp'

import { AuthUsers } from '@/collections/AuthUsers'
import { DemoPages } from '@/collections/DemoPages'
import { environment } from '@/config/environment'
import { AuditEvents } from '@/modules/audit/collections'
import { PermissionOverrides } from '@/modules/authorization/collections'
import { Activities } from '@/modules/content/activities/collections'
import { Announcements } from '@/modules/content/announcements/collections'
import { AssociationPages } from '@/modules/content/association-pages/collections'
import { GalleryWorks } from '@/modules/content/gallery/collections'
import { News } from '@/modules/content/news/collections'
import { MediaAssets } from '@/modules/media/collections'
import { sanitizePayloadLogObject } from '@/modules/identity-access/stale-login-logging'
import {
  FormDefinitions,
  FormVersions,
  Members,
  MembershipApplications,
  RecruitmentCycles,
  ReviewActions,
} from '@/modules/recruitment/collections'
import {
  AccountClaims,
  MemberIntakeApplications,
} from '@/modules/recruitment/member-account-claim/collections'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    components: {
      Nav: '/modules/identity-access/admin/member-account/IdentityAwareNav#IdentityAwareNav',
      beforeLogin: [
        '/modules/identity-access/admin/ActivationForm#ActivationForm',
      ],
      views: {
        dashboard: {
          Component:
            '/modules/admin-experience/AdminDashboardView#AdminDashboardView',
        },
        AccountManagement: {
          Component:
            '/modules/identity-access/admin/AccountManagementView#AccountManagementView',
          path: '/accounts',
        },
        MemberAccount: {
          Component:
            '/modules/recruitment/member-account-claim/admin/MemberAccountView#MemberAccountView',
          path: '/member-account',
        },
        MemberAccountClaims: {
          Component:
            '/modules/recruitment/member-account-claim/admin/MemberClaimAdminView#MemberClaimAdminView',
          path: '/member-account-claims',
        },
        MediaAssetUpload: {
          Component:
            '/modules/media/admin/MediaAssetUploadView#MediaAssetUploadView',
          path: '/media-assets',
        },
        RecruitmentReview: {
          Component:
            '/modules/recruitment/admin/ReviewQueueView#ReviewQueueView',
          path: '/recruitment-review',
        },
      },
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
    user: AuthUsers.slug,
  },
  collections: [
    AuthUsers,
    DemoPages,
    Activities,
    Announcements,
    AssociationPages,
    GalleryWorks,
    News,
    MediaAssets,
    RecruitmentCycles,
    FormDefinitions,
    FormVersions,
    MembershipApplications,
    Members,
    ReviewActions,
    AccountClaims,
    MemberIntakeApplications,
    AuditEvents,
    PermissionOverrides,
  ],
  db: postgresAdapter({
    idType: 'uuid',
    migrationDir: path.resolve(dirname, 'migrations'),
    pool: {
      connectionString: environment.databaseUrl,
    },
    push: false,
  }),
  editor: lexicalEditor(),
  graphQL: {
    disable: true,
  },
  i18n: {
    fallbackLanguage: 'zh',
    supportedLanguages: { zh },
  },
  logger: {
    destination: defaultLoggerOptions,
    options: {
      formatters: {
        log: sanitizePayloadLogObject,
      },
    },
  },
  secret: environment.payloadSecret,
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
