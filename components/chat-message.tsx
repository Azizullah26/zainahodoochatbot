import { UIMessage } from "ai"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Bot, User } from "lucide-react"
import { ToolOutput } from "@/components/tool-output"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth-provider"

interface ChatMessageProps {
  message: UIMessage
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user"
  const { user } = useAuth()

  return (
    <div
      className={cn(
        "flex gap-3 px-6 py-4",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <div className="size-8 shrink-0 rounded-full overflow-hidden ring-2 ring-primary/50 flex items-center justify-center bg-gradient-to-br from-primary/30 to-secondary/30">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
          >
            <source
              src="https://v1.pinimg.com/videos/mc/720p/35/b4/7e/35b47e00498aa77ba00f2aa03b1cf73a.mp4"
              type="video/mp4"
            />
          </video>
        </div>
      )}

      <div
        className={cn(
          "flex max-w-[80%] flex-col gap-1",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "rounded-br-md bg-primary text-primary-foreground"
              : "rounded-bl-md bg-muted text-foreground"
          )}
        >
          {message.parts.map((part, index) => {
            if (part.type === "text") {
              return (
                <div
                  key={index}
                  className="whitespace-pre-wrap [&>p]:mb-2 [&>p:last-child]:mb-0"
                >
                  {part.text}
                </div>
              )
            }

            // Handle all tool-* part types
            if (part.type.startsWith("tool-")) {
              const toolName = part.type.replace("tool-", "")
              const toolPart = part as unknown as {
                state: string
                input?: Record<string, unknown>
                output?: Record<string, unknown>
                errorText?: string
              }
              return (
                <ToolOutput
                  key={index}
                  toolName={toolName}
                  state={toolPart.state}
                  input={toolPart.input}
                  output={toolPart.output}
                  errorText={toolPart.errorText}
                />
              )
            }

            return null
          })}
        </div>
      </div>

      {isUser && (
        <Avatar className="size-8 shrink-0 border-2 border-primary/40 ring-1 ring-primary/20">
          <AvatarImage src={user?.image} alt={user?.name} />
          <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-background text-xs font-semibold">
            {user?.name?.[0]?.toUpperCase() || "U"}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  )
}
