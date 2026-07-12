#!/usr/bin/env node
import { createHash, createHmac } from 'node:crypto'

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY
const sessionToken = process.env.R2_SESSION_TOKEN ?? process.env.AWS_SESSION_TOKEN
const buckets = (
  process.env.HN42_SCREENSHOT_RESET_BUCKETS
  ?? (process.env.HN42_SCREENSHOT_BUCKET ?? 'hn42-screenshots')
)
  .split(',')
  .map((bucket) => bucket.trim())
  .filter(Boolean)
const prefix = process.env.HN42_SCREENSHOT_RESET_PREFIX ?? 'screenshots/v2/'
const dryRun = process.argv.includes('--dry-run')

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.error([
    'Missing R2 S3 credentials.',
    'Set CLOUDFLARE_ACCOUNT_ID plus R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY,',
    'or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY for an R2 access key.',
  ].join(' '))
  process.exit(1)
}

const hash = (value) => createHash('sha256').update(value).digest('hex')
const hmac = (key, value, encoding) => createHmac('sha256', key).update(value).digest(encoding)
const toAmzDate = (date) => date.toISOString().replace(/[:-]|\.\d{3}/g, '')
const toDateStamp = (amzDate) => amzDate.slice(0, 8)
const encodePath = (value) => encodeURIComponent(value).replace(/%2F/g, '/')
const encodeQuery = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)

const xmlEscape = (value) => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const buildQuery = (query) => {
  return Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeQuery(key)}=${encodeQuery(String(value))}`)
    .join('&')
}

const signRequest = ({ body = '', bucket, method, query = {} }) => {
  const host = `${accountId}.r2.cloudflarestorage.com`
  const amzDate = toAmzDate(new Date())
  const dateStamp = toDateStamp(amzDate)
  const payloadHash = hash(body)
  const canonicalUri = `/${encodePath(bucket)}`
  const canonicalQuery = buildQuery(query)
  const headers = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  }

  if (sessionToken) {
    headers['x-amz-security-token'] = sessionToken
  }

  const signedHeaders = Object.keys(headers).sort().join(';')
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((key) => `${key}:${headers[key]}\n`)
    .join('')
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hash(canonicalRequest),
  ].join('\n')
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const regionKey = hmac(dateKey, 'auto')
  const serviceKey = hmac(regionKey, 's3')
  const signingKey = hmac(serviceKey, 'aws4_request')
  const signature = hmac(signingKey, stringToSign, 'hex')
  const url = `https://${host}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ''}`

  return {
    body,
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    url,
  }
}

const request = async ({ body, bucket, method, query }) => {
  const signed = signRequest({ body, bucket, method, query })
  const response = await fetch(signed.url, {
    body: method === 'GET' ? undefined : signed.body,
    headers: signed.headers,
    method,
  })
  const text = await response.text()

  if (!response.ok) {
    throw new Error(`${method} ${signed.url} failed with ${response.status}: ${text}`)
  }

  return text
}

const getTagValues = (xml, tagName) => {
  const values = []
  const pattern = new RegExp(`<${tagName}>(.*?)</${tagName}>`, 'gs')
  let match

  while ((match = pattern.exec(xml)) !== null) {
    values.push(match[1])
  }

  return values
}

const listKeys = async (bucket) => {
  const keys = []
  let continuationToken

  do {
    const xml = await request({
      bucket,
      method: 'GET',
      query: {
        'continuation-token': continuationToken,
        'encoding-type': 'url',
        'list-type': '2',
        'max-keys': '1000',
        prefix,
      },
    })
    keys.push(...getTagValues(xml, 'Key').map((key) => decodeURIComponent(key)))
    continuationToken = getTagValues(xml, 'NextContinuationToken')[0]
      ? decodeURIComponent(getTagValues(xml, 'NextContinuationToken')[0])
      : undefined
  } while (continuationToken)

  return keys
}

const deleteKeys = async (bucket, keys) => {
  if (keys.length === 0 || dryRun) {
    return
  }

  for (let index = 0; index < keys.length; index += 1000) {
    const batch = keys.slice(index, index + 1000)
    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Delete>',
      '<Quiet>true</Quiet>',
      ...batch.map((key) => `<Object><Key>${xmlEscape(key)}</Key></Object>`),
      '</Delete>',
    ].join('')

    await request({
      body,
      bucket,
      method: 'POST',
      query: {
        delete: '',
      },
    })
  }
}

for (const bucket of buckets) {
  console.log(`Scanning ${bucket}/${prefix}`)
  const keys = await listKeys(bucket)
  console.log(`${dryRun ? 'Would delete' : 'Deleting'} ${keys.length} objects from ${bucket}`)
  await deleteKeys(bucket, keys)
}

console.log(dryRun ? 'Dry run complete.' : 'Screenshot cache reset complete.')
