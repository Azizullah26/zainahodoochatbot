"use client"

import { useRef, useEffect } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { ChatHeader } from "@/components/chat-header"
import { ChatMessage } from "@/components/chat-message"
import { ChatSuggestions } from "@/components/chat-suggestions"
import { ChatInput } from "@/components/chat-input"
import { ScrollArea } from "@/components/ui/scroll-area"

const transport = new DefaultChatTransport({ api: "/api/chat" })

export function ChatContainer() {
  const { messages, sendMessage, status } = useChat({ transport })
  const scrollRef = useRef<HTMLDivElement>(null)

  const isLoading = status === "streaming" || status === "submitted"
  const hasMessages = messages.length > 0

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

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
          <ScrollArea className="flex-1">
            <div ref={scrollRef} className="mx-auto max-w-3xl">
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
            </div>
          </ScrollArea>
        )}
      </div>

      <ChatInput onSend={handleSend} isLoading={isLoading} />
    </div>
  )
}
