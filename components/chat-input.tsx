"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ArrowUp, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChatInputProps {
  onSend: (text: string) => void
  isLoading: boolean
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [input, setInput] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
    }
  }, [input])

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return
    onSend(input.trim())
    setInput("")
  }

  return (
    <div className="border-t border-primary/20 bg-card/40 backdrop-blur-sm px-4 py-4">
      <div className="mx-auto flex max-w-3xl items-end gap-3">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder="Ask about projects, employees, tasks..."
            rows={1}
            className={cn(
              "w-full resize-none rounded-xl border border-primary/30 bg-background/50 px-4 py-3 pr-12 text-sm text-foreground input-glow",
              "placeholder:text-muted-foreground/50",
              "focus:outline-none focus:border-primary focus:shadow-md focus:shadow-primary/20 focus:bg-background/70",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          />
        </div>
        <Button
          type="button"
          size="icon"
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          className="size-10 shrink-0 rounded-xl button-glow bg-gradient-to-r from-primary to-secondary hover:from-primary/80 hover:to-secondary/80 text-background"
          aria-label="Send message"
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowUp className="size-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
