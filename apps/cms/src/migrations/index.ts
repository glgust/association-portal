import * as migration_20260712_135538_m000_bootstrap from './20260712_135538_m000_bootstrap'
import * as migration_20260713_102819_m001_business_baseline from './20260713_102819_m001_business_baseline'
import * as migration_20260713_113849_m002_form_version_schema_hash from './20260713_113849_m002_form_version_schema_hash'
import * as migration_20260713_123329_m003_review_concurrency_guard from './20260713_123329_m003_review_concurrency_guard'
import * as migration_20260714_064522_m004_announcement_publication from './20260714_064522_m004_announcement_publication'
import * as migration_20260714_105537_m005_audit_read_permission from './20260714_105537_m005_audit_read_permission'
import * as migration_20260715_164312_m006_association_pages from './20260715_164312_m006_association_pages'
import * as migration_20260716_162518_m007_activity_catalog from './20260716_162518_m007_activity_catalog'
import * as migration_20260719_063428_m008_news_publication from './20260719_063428_m008_news_publication'
import * as migration_20260727_150000_m009_identity_access_lifecycle from './20260727_150000_m009_identity_access_lifecycle'
import * as migration_20260810_150000_m010_member_identity_account_claim from './20260810_150000_m010_member_identity_account_claim'
import * as migration_20260815_122906_m011_account_claim_recovery_status from './20260815_122906_m011_account_claim_recovery_status'
import * as migration_20260827_142158_m012_media_gallery_publication from './20260827_142158_m012_media_gallery_publication'

export const migrations = [
  {
    up: migration_20260712_135538_m000_bootstrap.up,
    down: migration_20260712_135538_m000_bootstrap.down,
    name: '20260712_135538_m000_bootstrap',
  },
  {
    up: migration_20260713_102819_m001_business_baseline.up,
    down: migration_20260713_102819_m001_business_baseline.down,
    name: '20260713_102819_m001_business_baseline',
  },
  {
    up: migration_20260713_113849_m002_form_version_schema_hash.up,
    down: migration_20260713_113849_m002_form_version_schema_hash.down,
    name: '20260713_113849_m002_form_version_schema_hash',
  },
  {
    up: migration_20260713_123329_m003_review_concurrency_guard.up,
    down: migration_20260713_123329_m003_review_concurrency_guard.down,
    name: '20260713_123329_m003_review_concurrency_guard',
  },
  {
    up: migration_20260714_064522_m004_announcement_publication.up,
    down: migration_20260714_064522_m004_announcement_publication.down,
    name: '20260714_064522_m004_announcement_publication',
  },
  {
    up: migration_20260714_105537_m005_audit_read_permission.up,
    down: migration_20260714_105537_m005_audit_read_permission.down,
    name: '20260714_105537_m005_audit_read_permission',
  },
  {
    up: migration_20260715_164312_m006_association_pages.up,
    down: migration_20260715_164312_m006_association_pages.down,
    name: '20260715_164312_m006_association_pages',
  },
  {
    up: migration_20260716_162518_m007_activity_catalog.up,
    down: migration_20260716_162518_m007_activity_catalog.down,
    name: '20260716_162518_m007_activity_catalog',
  },
  {
    up: migration_20260719_063428_m008_news_publication.up,
    down: migration_20260719_063428_m008_news_publication.down,
    name: '20260719_063428_m008_news_publication',
  },
  {
    up: migration_20260727_150000_m009_identity_access_lifecycle.up,
    down: migration_20260727_150000_m009_identity_access_lifecycle.down,
    name: '20260727_150000_m009_identity_access_lifecycle',
  },
  {
    up: migration_20260810_150000_m010_member_identity_account_claim.up,
    down: migration_20260810_150000_m010_member_identity_account_claim.down,
    name: '20260810_150000_m010_member_identity_account_claim',
  },
  {
    up: migration_20260815_122906_m011_account_claim_recovery_status.up,
    down: migration_20260815_122906_m011_account_claim_recovery_status.down,
    name: '20260815_122906_m011_account_claim_recovery_status',
  },
  {
    up: migration_20260827_142158_m012_media_gallery_publication.up,
    down: migration_20260827_142158_m012_media_gallery_publication.down,
    name: '20260827_142158_m012_media_gallery_publication',
  },
]
