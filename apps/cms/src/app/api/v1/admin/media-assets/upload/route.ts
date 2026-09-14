import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import { environment } from '@/config/environment'
import { authorize } from '@/modules/authorization/authorize'
import { loadActor } from '@/modules/authorization/load-actor'
import { readBoundedMediaBody } from '@/modules/media/bounded-body'
import { MAX_UPLOAD_BYTES } from '@/modules/media/image-processing'
import { createObjectStorage } from '@/modules/media/storage'
import { uploadMediaAsset } from '@/modules/media/upload'
import { createPayloadRequest, requestIdFrom } from '@/modules/http/request'
import { errorResponse } from '@/modules/http/response'
import { BusinessError } from '@/modules/shared/business-error'
import config from '@/payload.config'

export async function POST(request: Request) {
  const requestId = requestIdFrom(request.headers)
  try {
    const contentLengthHeader = request.headers.get('content-length')
    const contentLength = Number(contentLengthHeader)
    if (contentLengthHeader && contentLength > MAX_UPLOAD_BYTES) {
      throw new BusinessError(
        'VALIDATION_FAILED',
        'Image exceeds the 10 MiB upload limit',
        413,
      )
    }
    const payload = await getPayload({ config })
    const req = await createPayloadRequest(payload, request.headers)
    const actor = await loadActor(payload, req)
    if (!actor) {
      throw new BusinessError(
        req.user ? 'FORBIDDEN' : 'UNAUTHENTICATED',
        req.user ? 'Forbidden' : 'Authentication required',
        req.user ? 403 : 401,
      )
    }
    if (
      !authorize(actor, 'content.create', { type: 'global' }, new Date())
        .allowed
    ) {
      throw new BusinessError('FORBIDDEN', 'Forbidden', 403)
    }

    const claimedMimeType = request.headers.get('content-type')?.split(';')[0]
    if (!claimedMimeType) {
      throw new BusinessError(
        'VALIDATION_FAILED',
        'Image Content-Type is required',
        400,
      )
    }
    const body = await readBoundedMediaBody(request.body)
    let storage
    try {
      storage = createObjectStorage(environment.mediaStorage)
    } catch {
      throw new BusinessError(
        'SERVICE_UNAVAILABLE',
        'Media storage is temporarily unavailable',
        503,
      )
    }
    const asset = await uploadMediaAsset({
      actorId: actor.id,
      body,
      claimedMimeType,
      logger: (event) => payload.logger.warn(event),
      payload,
      req,
      requestId,
      storage,
    })
    return NextResponse.json(
      {
        id: asset.id,
        byteSize: asset.byteSize,
        height: asset.height,
        mimeType: asset.mimeType,
        width: asset.width,
      },
      { headers: { 'x-request-id': requestId }, status: 201 },
    )
  } catch (error) {
    return errorResponse(error, requestId)
  }
}
