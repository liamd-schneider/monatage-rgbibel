import { useState, useEffect, useRef, useCallback } from "react"
import { createClient } from "@sanity/client"
import { useRouter } from "next/router"

// ── Config ────────────────────────────────────────────────────────────────────
// All writes go through the main app's API route (CORS-enabled).
// Only reads that are safe (no secret token needed) use the public Sanity client.
const MAIN_API = "https://montage-rgbibel-pc.vercel.app/api/sanity"
//                ↑ Replace with your actual PC-app domain

// Read-only public client (no token needed for fetching session by ID)
const client = createClient({
  projectId: "6fnwq7k5",
  dataset: "production",
  apiVersion: "2023-11-21",
  useCdn: false,
  // No token – reads are public; all writes go via MAIN_API
})

const steps = [
  { title: "CPU-Installation",          description: "Platzieren Sie vorsichtig die CPU im Sockel.",        icon: "🔲" },
  { title: "Mainboard-Installation",    description: "Setzen Sie das Mainboard ins Gehäuse ein.",           icon: "🖥️" },
  { title: "Kühler-Installation",       description: "Bringen Sie den CPU-Kühler an.",                      icon: "❄️" },
  { title: "RAM-Installation",          description: "Installieren Sie die RAM-Module.",                     icon: "🟦" },
  { title: "Grafikkarten-Installation", description: "Setzen Sie die Grafikkarte ein.",                     icon: "🎮" },
  { title: "Netzteil-Installation",     description: "Installieren Sie das Netzteil.",                      icon: "⚡" },
  { title: "Kabelmanagement",           description: "Ordnen Sie die Kabel sorgfältig an.",                 icon: "🔌" },
  { title: "Abschließende Überprüfung", description: "Finale Kontrolle des gesamten Systems.",              icon: "✅" },
]

// ── API helpers ───────────────────────────────────────────────────────────────
async function callMainApi(action, payload) {
  const res = await fetch(MAIN_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

async function fetchSession(sessionId) {
  return client.fetch(
    `*[_type == "assemblySession" && sessionId == $sid][0]`,
    { sid: sessionId }
  )
}

// Convert a Blob/File to base64 string
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result.split(",")[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// Upload via the PC app's API (avoids CORS / token exposure)
async function uploadImageViaApi(blob, filename) {
  const base64 = await blobToBase64(blob)
  return callMainApi("uploadImageFromMobile", {
    base64,
    filename,
    contentType: blob.type || "image/jpeg",
  })
  // returns { url, assetId }
}

// ── Signature Canvas ──────────────────────────────────────────────────────────
function SignatureCanvas({ onSave }) {
  const canvasRef = useRef(null)
  const drawing   = useRef(false)
  const lastPos   = useRef(null)

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const src  = e.touches ? e.touches[0] : e
    return {
      x: (src.clientX - rect.left) * (canvas.width  / rect.width),
      y: (src.clientY - rect.top)  * (canvas.height / rect.height),
    }
  }

  const start = (e) => { e.preventDefault(); drawing.current = true;  lastPos.current = getPos(e, canvasRef.current) }
  const move  = (e) => {
    e.preventDefault()
    if (!drawing.current) return
    const canvas = canvasRef.current
    const ctx    = canvas.getContext("2d")
    const pos    = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = "#04cefe"
    ctx.lineWidth   = 2.5
    ctx.lineCap     = "round"
    ctx.lineJoin    = "round"
    ctx.stroke()
    lastPos.current = pos
  }
  const end = (e) => { e.preventDefault(); drawing.current = false }

  const clear = () => {
    const canvas = canvasRef.current
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height)
  }

  const save = () => canvasRef.current.toBlob((blob) => onSave(blob), "image/png")

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase" }}>
        Hier unterschreiben
      </div>
      <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", border: "2px solid rgba(4,206,254,0.3)", background: "rgba(0,0,0,0.6)" }}>
        <canvas
          ref={canvasRef}
          width={680}
          height={200}
          style={{ width: "100%", touchAction: "none", display: "block" }}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        />
        <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, margin: "0 24px", height: 1, background: "rgba(255,255,255,0.1)" }} />
        <div style={{ position: "absolute", bottom: 20, left: 24, color: "rgba(255,255,255,0.15)", fontSize: 10, letterSpacing: "0.3em", textTransform: "uppercase" }}>Unterschrift</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={clear} style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.5)", fontSize: 14, cursor: "pointer" }}>
          Löschen
        </button>
        <button onClick={save} style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#04cefe,rgba(4,206,254,0.5))", color: "#000", fontSize: 14, fontWeight: 900, cursor: "pointer" }}>
          Speichern
        </button>
      </div>
    </div>
  )
}

// ── Image Upload Area ─────────────────────────────────────────────────────────
function ImageUploadArea({ stepIndex, images, onUpload, uploading }) {
  const inputRef = useRef(null)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {images.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          {images.map((img, i) => (
            <div key={i} style={{ position: "relative", aspectRatio: "1", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
              <img src={img.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.4), transparent)" }} />
              <div style={{ position: "absolute", bottom: 4, right: 4, fontSize: 9, color: "rgba(255,255,255,0.5)", background: "rgba(0,0,0,0.6)", padding: "1px 4px", borderRadius: 4 }}>#{i + 1}</div>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        style={{ display: "none" }}
        onChange={async (e) => {
          const files = Array.from(e.target.files)
          for (const file of files) await onUpload(file)
          e.target.value = ""
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        style={{
          width: "100%", padding: "16px 0", borderRadius: 16,
          border: "2px dashed rgba(4,206,254,0.3)", background: "transparent",
          color: "#04cefe", fontSize: 14, fontWeight: 700, letterSpacing: "0.15em",
          textTransform: "uppercase", cursor: uploading ? "not-allowed" : "pointer",
          opacity: uploading ? 0.4 : 1,
        }}
      >
        {uploading ? "Hochladen…" : `+ ${images.length > 0 ? "Weiteres Bild" : "Bild aufnehmen"}`}
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MobilePage() {
  const router = useRouter()
  const { session: sessionId } = router.query

  const [sessionDoc, setSessionDoc]         = useState(null)
  const [currentStep, setCurrentStep]       = useState(0)
  const [stepImages, setStepImages]         = useState(steps.map(() => []))
  const [uploading, setUploading]           = useState(false)
  const [signerName, setSignerName]         = useState("")
  const [signatureSaved, setSignatureSaved] = useState(false)
  const [sigUploading, setSigUploading]     = useState(false)
  const [error, setError]                   = useState(null)
  const [installed, setInstalled]           = useState(false)
  const deferredPrompt                      = useRef(null)

  // PWA install prompt
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); deferredPrompt.current = e; setInstalled(true) }
    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  const installPWA = async () => {
    if (!deferredPrompt.current) return
    deferredPrompt.current.prompt()
    await deferredPrompt.current.userChoice
    deferredPrompt.current = null
    setInstalled(false)
  }

  // Load session
  useEffect(() => {
    if (!sessionId) return
    fetchSession(sessionId).then((doc) => {
      if (!doc) { setError("Session nicht gefunden."); return }
      setSessionDoc(doc)
      const restored = steps.map((_, i) => {
        const s = doc.steps?.find((st) => st.stepIndex === i)
        return s?.images || []
      })
      setStepImages(restored)
    })
  }, [sessionId])

  // ── Ping the PC app every 10 s so it knows the phone is connected ──────────
  useEffect(() => {
    if (!sessionId) return

    const ping = async () => {
      try {
        const doc = await fetchSession(sessionId)
        if (doc?._id) {
          await callMainApi("pingSession", { id: doc._id })
        }
      } catch (e) {
        console.warn("Ping failed:", e.message)
      }
    }

    ping() // immediate first ping
    const interval = setInterval(ping, 10000)
    return () => clearInterval(interval)
  }, [sessionId])

  // Upload image via the PC app's API
  const handleImageUpload = useCallback(async (file, stepIdx) => {
    setUploading(true)
    try {
      const { url, assetId } = await uploadImageViaApi(file, `step-${stepIdx}-${Date.now()}.jpg`)
      const newImg = { url, assetId, uploadedAt: new Date().toISOString() }

      setStepImages((prev) => {
        const next = [...prev]
        next[stepIdx] = [...(next[stepIdx] || []), newImg]
        return next
      })

      // Patch the session via the PC app API
      const fresh = await fetchSession(sessionId)
      if (fresh) {
        const stepsCopy = (fresh.steps || []).map((s) =>
          s.stepIndex === stepIdx
            ? { ...s, images: [...(s.images || []), newImg] }
            : s
        )
        if (!stepsCopy.find((s) => s.stepIndex === stepIdx)) {
          stepsCopy.push({ stepIndex: stepIdx, images: [newImg] })
        }
        await callMainApi("patchSession", {
          id: fresh._id,
          steps: stepsCopy,
          currentStep: stepIdx,
        })
      }
    } catch (e) {
      console.error(e)
      setError("Bild-Upload fehlgeschlagen. Bitte nochmal versuchen.")
      setTimeout(() => setError(null), 3000)
    } finally {
      setUploading(false)
    }
  }, [sessionId])

  // Upload signature via the PC app's API
  const handleSignature = useCallback(async (blob) => {
    setSigUploading(true)
    try {
      const { url, assetId } = await uploadImageViaApi(blob, `signature-${Date.now()}.png`)
      const sigData = {
        url,
        assetId,
        signerName: signerName || "Mitarbeiter",
        signedAt: new Date().toISOString(),
      }
      const fresh = await fetchSession(sessionId)
      if (fresh) {
        await callMainApi("patchSession", {
          id: fresh._id,
          signature: sigData,
          status: "completed",
        })
      }
      setSignatureSaved(true)
    } catch (e) {
      console.error(e)
      setError("Unterschrift-Upload fehlgeschlagen.")
      setTimeout(() => setError(null), 3000)
    } finally {
      setSigUploading(false)
    }
  }, [sessionId, signerName])

  const isLastStep    = currentStep === steps.length - 1
  const currentImages = stepImages[currentStep] || []
  const allStepsDone  = stepImages.every((imgs) => imgs.length > 0)

  if (!sessionId) {
    return (
      <div style={{ minHeight: "100vh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", fontFamily: "'DM Mono', monospace" }}>
        <div>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ color: "#fff", fontWeight: 900, fontSize: 20, marginBottom: 8 }}>Keine Session</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>Bitte QR-Code am PC scannen.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", fontFamily: "'DM Mono', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
        * { -webkit-tap-highlight-color: transparent; }
        body { overscroll-behavior: none; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* PWA Install Banner */}
      {installed && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: "#04cefe", color: "#000", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.05em" }}>App installieren für bessere Nutzung</span>
          <button onClick={installPWA} style={{ fontSize: 12, fontWeight: 900, background: "#000", color: "#04cefe", padding: "4px 12px", borderRadius: 99, border: "none", cursor: "pointer" }}>
            Installieren
          </button>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div style={{ position: "fixed", bottom: 16, left: 16, right: 16, zIndex: 50, background: "rgba(239,68,68,0.9)", color: "#fff", fontSize: 14, fontWeight: 700, padding: "12px 16px", borderRadius: 16, textAlign: "center" }}>
          {error}
        </div>
      )}

      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(0,0,0,0.9)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: "#04cefe", fontSize: 9, letterSpacing: "0.3em", textTransform: "uppercase" }}>RGBibel</div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: 16 }}>{steps[currentStep].icon} {steps[currentStep].title}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase" }}>Schritt</div>
            <div style={{ color: "#04cefe", fontWeight: 900 }}>
              {currentStep + 1}<span style={{ color: "rgba(255,255,255,0.3)" }}>/{steps.length}</span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 12, display: "flex", gap: 4 }}>
          {steps.map((_, i) => (
            <div
              key={i}
              onClick={() => setCurrentStep(i)}
              style={{
                flex: 1, height: 4, borderRadius: 99, cursor: "pointer", transition: "all 0.3s",
                background: stepImages[i]?.length > 0
                  ? "linear-gradient(90deg,#10b981,rgba(16,185,129,0.5))"
                  : i === currentStep
                  ? "linear-gradient(90deg,#04cefe,rgba(4,206,254,0.4))"
                  : "rgba(255,255,255,0.08)",
              }}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "24px 20px 128px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Step description */}
        <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20, background: "rgba(255,255,255,0.02)" }}>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, lineHeight: 1.6 }}>{steps[currentStep].description}</p>
          {currentImages.length === 0 && (
            <div style={{ marginTop: 12, fontSize: 10, color: "rgba(4,206,254,0.6)", letterSpacing: "0.15em", textTransform: "uppercase" }}>
              Mindestens 1 Bild erforderlich
            </div>
          )}
        </div>

        {/* Image upload */}
        <ImageUploadArea
          stepIndex={currentStep}
          images={currentImages}
          uploading={uploading}
          onUpload={(file) => handleImageUpload(file, currentStep)}
        />

        {/* Signature – only on last step when all done */}
        {isLastStep && allStepsDone && (
          <div style={{ border: "1px solid rgba(4,206,254,0.2)", borderRadius: 16, padding: 20, background: "rgba(4,206,254,0.03)", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ color: "#04cefe", fontSize: 10, letterSpacing: "0.3em", textTransform: "uppercase", fontWeight: 700 }}>
              Abschluss &amp; Unterschrift
            </div>

            {!signatureSaved ? (
              <>
                <input
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Ihr Name"
                  style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 16px", color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit" }}
                />
                <SignatureCanvas onSave={handleSignature} />
                {sigUploading && (
                  <div style={{ color: "#04cefe", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 16, height: 16, border: "2px solid rgba(4,206,254,0.3)", borderTopColor: "#04cefe", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />
                    Unterschrift wird gespeichert…
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                <div style={{ color: "#10b981", fontWeight: 900, fontSize: 18 }}>Abgeschlossen!</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginTop: 8 }}>
                  Unterschrift wurde übertragen. Der PC-Techniker kann nun den Bericht generieren.
                </div>
              </div>
            )}
          </div>
        )}

        {isLastStep && !allStepsDone && (
          <div style={{ border: "1px solid rgba(234,179,8,0.2)", borderRadius: 16, padding: 16, background: "rgba(234,179,8,0.05)", color: "rgba(234,179,8,0.8)", fontSize: 12, textAlign: "center" }}>
            Bitte erst alle Schritte mit Bildern versehen, bevor unterschrieben werden kann.
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.95)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.08)", padding: "16px 20px" }}>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.5)", fontSize: 14, fontWeight: 700, cursor: currentStep === 0 ? "not-allowed" : "pointer", opacity: currentStep === 0 ? 0.2 : 1, fontFamily: "inherit" }}
          >
            ← Zurück
          </button>
          <button
            onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
            disabled={currentImages.length === 0 || isLastStep}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 12, border: "none",
              background: currentImages.length > 0 && !isLastStep ? "linear-gradient(135deg,#04cefe,rgba(4,206,254,0.5))" : "rgba(255,255,255,0.1)",
              color: currentImages.length > 0 && !isLastStep ? "#000" : "rgba(255,255,255,0.3)",
              fontSize: 14, fontWeight: 900, cursor: currentImages.length === 0 || isLastStep ? "not-allowed" : "pointer",
              opacity: currentImages.length === 0 || isLastStep ? 0.3 : 1, fontFamily: "inherit",
            }}
          >
            Weiter →
          </button>
        </div>
      </div>
    </div>
  )
}