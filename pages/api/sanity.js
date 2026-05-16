// pages/api/sanity.js
import { createClient } from "@sanity/client"

const client = createClient({
  projectId: "6fnwq7k5",
  dataset: "production",
  apiVersion: "2023-11-21",
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
})

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://montage-rgbibel.vercel.app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export default async function handler(req, res) {
  // Set CORS headers on every response
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v))

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end()
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { action, payload } = req.body

  try {
    switch (action) {
      case "fetchOrder": {
        const data = await client.fetch(
          `*[_type == "order" && pcNumber == $n][0]`,
          { n: payload.orderNumber }
        )
        return res.status(200).json(data)
      }

      case "createSession": {
        const data = await client.create(payload)
        return res.status(200).json(data)
      }

      // Used by both PC app and mobile PWA
      case "fetchSession": {
        const data = await client.fetch(
          `*[_type == "assemblySession" && sessionId == $sid][0]`,
          { sid: payload.sessionId }
        )
        return res.status(200).json(data)
      }

      case "patchOrder": {
        const data = await client
          .patch(payload.orderId)
          .set({
            montagebericht: payload.montagebericht,
            status: payload.status,
          })
          .commit()
        return res.status(200).json(data)
      }

      case "patchSession": {
        // Build the set object dynamically — only update fields that are provided
        const fields = {}
        if (payload.status      !== undefined) fields.status       = payload.status
        if (payload.steps       !== undefined) fields.steps        = payload.steps
        if (payload.signature   !== undefined) fields.signature    = payload.signature
        if (payload.currentStep !== undefined) fields.currentStep  = payload.currentStep

        const data = await client.patch(payload.id).set(fields).commit()
        return res.status(200).json(data)
      }

      // Called by mobile PWA to upload step images
      case "uploadImageFromMobile": {
        const buffer = Buffer.from(payload.base64, "base64")
        const asset = await client.assets.upload("image", buffer, {
          filename: payload.filename,
          contentType: payload.contentType || "image/jpeg",
        })
        return res.status(200).json({ url: asset.url, assetId: asset._id })
      }

      // Called by mobile PWA every 10s to signal it's still connected
      case "pingSession": {
        const data = await client
          .patch(payload.id)
          .set({ lastMobileActivity: new Date().toISOString() })
          .commit()
        return res.status(200).json(data)
      }

      case "uploadFile": {
        const buffer = Buffer.from(payload.base64, "base64")
        const fileAsset = await client.assets.upload("file", buffer, {
          filename: payload.filename,
          contentType: "application/pdf",
        })
        const data = await client
          .patch(payload.orderId)
          .set({
            montagebericht: {
              _type: "file",
              asset: { _type: "reference", _ref: fileAsset._id },
            },
            status: "in Bearbeitung",
          })
          .commit()
        return res.status(200).json(data)
      }

      default:
        return res.status(400).json({ error: "Unknown action" })
    }
  } catch (e) {
    console.error("[sanity api]", e)
    return res.status(500).json({ error: e.message })
  }
}