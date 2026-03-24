"use client"

import { useRef, useEffect } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { ChatHeader } from "@/components/chat-header"
import { ChatMessage } from "@/components/chat-message"
import { ChatSuggestions } from "@/components/chat-suggestions"
import { ChatInput } from "@/components/chat-input"
import { ScrollArea } from "@/components/ui/scroll-area"

// Custom fetch that includes credentials (cookies) for authentication
const transport = new DefaultChatTransport({
  api: "/api/chat",
  fetch: (input, init) => {
    return fetch(input, {
      ...init,
      credentials: "include", // Include cookies in requests
    })
  },
})

export function ChatContainer() {
  const { messages, sendMessage, status } = useChat({ transport })
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  const isLoading = status === "streaming" || status === "submitted"
  const hasMessages = messages.length > 0

  // Scroll to bottom whenever messages change or streaming updates content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, status])

  const handleSend = (text: string) => {
    if (isLoading) return
    sendMessage({ text })
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <ChatHeader />

      <div className="flex flex-1 flex-col overflow-hidden">
        {!hasMessages ? (
          <ChatSuggestions onSelect={handleSend} />
        ) : (
          <div ref={scrollAreaRef} className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}

              {isLoading &&
                messages.length > 0 &&
                messages[messages.length - 1].role === "user" && (
                  <div className="flex gap-3 px-6 py-4">
                    <div className="flex size-8 items-center justify-center rounded-full border border-border bg-primary/10">
                      <div className="size-4 animate-pulse rounded-full bg-primary/40" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="size-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:0ms]" />
                      <div className="size-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:150ms]" />
                      <div className="size-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:300ms]" />
                    </div>
                  </div>
                )}

              {/* Invisible anchor element always at the bottom */}
              <div ref={bottomRef} className="h-1" />
            </div>
          </div>
        )}
      </div>

      <ChatInput onSend={handleSend} isLoading={isLoading} />
    </div>
  )
}
