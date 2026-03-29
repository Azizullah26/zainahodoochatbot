"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Mic, MicOff, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface VoiceInputProps {
  onTranscript: (text: string) => void
  disabled?: boolean
  compact?: boolean
}

// Type definitions for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
  }
}

export function VoiceInput({ onTranscript, disabled = false, compact = false }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<any>(null)
  const finalTranscriptRef = useRef("")
  const isStartingRef = useRef(false)

  useEffect(() => {
    // Check browser support for Web Speech API
    const SpeechRecognition =
      (typeof window !== "undefined" && window.SpeechRecognition) ||
      (typeof window !== "undefined" && (window as any).webkitSpeechRecognition)

    if (!SpeechRecognition) {
      setIsSupported(false)
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = "en-US"

    recognition.onstart = () => {
      isStartingRef.current = false
      setIsListening(true)
      setError(null)
    }

    recognition.onresult = (event: any) => {
      let interimTranscript = ""

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript

        if (event.results[i].isFinal) {
          finalTranscriptRef.current += transcript + " "
        } else {
          interimTranscript += transcript
        }
      }

      // Update the parent with interim results for real-time feedback
      if (finalTranscriptRef.current || interimTranscript) {
        onTranscript(finalTranscriptRef.current + interimTranscript)
      }
    }

    recognition.onerror = (event: any) => {
      let errorMessage = "Speech recognition error"

      switch (event.error) {
        case "network":
          errorMessage = "Network error. Please check your connection."
          break
        case "not-allowed":
          errorMessage = "Microphone permission denied. Please enable microphone access."
          break
        case "no-speech":
          errorMessage = "No speech detected. Please try again."
          break
        default:
          errorMessage = `Error: ${event.error}`
      }

      setError(errorMessage)
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
      // Submit the final transcript
      if (finalTranscriptRef.current.trim()) {
        onTranscript(finalTranscriptRef.current.trim())
      }
      finalTranscriptRef.current = ""
    }

    recognitionRef.current = recognition

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
    }
  }, [onTranscript])

  const handleToggleMicrophone = () => {
    if (!recognitionRef.current) return

    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
      isStartingRef.current = false
    } else {
      // Prevent multiple start() calls
      if (isStartingRef.current) return
      
      isStartingRef.current = true
      finalTranscriptRef.current = ""
      setError(null)
      
      try {
        recognitionRef.current.start()
      } catch (err) {
        console.error("[v0] Error starting speech recognition:", err)
        isStartingRef.current = false
        setError("Failed to start microphone. Please try again.")
      }
    }
  }

  if (!isSupported) {
    return null
  }

  return (
    <div className="relative">
      <Button
        type="button"
        size="icon"
        onClick={handleToggleMicrophone}
        disabled={disabled}
        className={cn(
          "transition-all duration-300",
          compact ? "size-7 rounded-lg" : "size-10 rounded-xl shrink-0",
          isListening
            ? "bg-destructive/20 hover:bg-destructive/30 text-destructive border-2 border-destructive/50 animate-pulse"
            : "bg-primary/10 hover:bg-primary/20 text-primary border-2 border-primary/30"
        )}
        title={isListening ? "Stop listening" : "Start listening"}
      >
        {isListening ? (
          <Mic className={cn("animate-pulse", compact ? "size-4" : "size-5")} />
        ) : (
          <MicOff className={cn(compact ? "size-4" : "size-5")} />
        )}
      </Button>

      {!compact && (
        <>
          {error && (
            <div className="absolute bottom-full mb-2 left-0 right-0 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 text-xs text-destructive flex items-center gap-2 whitespace-nowrap z-50">
              <AlertCircle className="size-3 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isListening && (
            <div className="absolute bottom-full mb-2 left-0 bg-primary/10 border border-primary/30 rounded-lg px-3 py-2 text-xs text-primary whitespace-nowrap z-50">
              Listening...
            </div>
          )}
        </>
      )}
    </div>
  )
}
