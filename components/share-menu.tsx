"use client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Share2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface ShareMenuProps {
  postId: number | string
  postTitle: string
}

export function ShareMenu({ postId, postTitle }: ShareMenuProps) {
  const getPostUrl = () => `${window.location.origin}/post/${postId}`

  const shareToSNS = (platform: string) => {
    const encodedUrl = encodeURIComponent(getPostUrl())
    const encodedTitle = encodeURIComponent(postTitle)

    const urls: { [key: string]: string } = {
      twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      line: `https://social-plugins.line.me/lineit/share?url=${encodedUrl}`,
      kakao: `https://story.kakao.com/share?url=${encodedUrl}`,
      discord: `https://discord.com/channels/@me`,
      instagram: `https://www.instagram.com/`,
    }

    if (urls[platform]) {
      window.open(urls[platform], "_blank", "width=600,height=400")
    }
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(getPostUrl())
    toast({ title: "완료", description: "링크가 복사되었습니다!" })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground h-9 w-9"
          aria-label="공유"
        >
          <Share2 className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem onClick={() => shareToSNS("twitter")}>
          <span className="font-medium">X (Twitter)</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => shareToSNS("facebook")}>
          <span className="font-medium">Facebook</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => shareToSNS("kakao")}>
          <span className="font-medium">KakaoStory</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => shareToSNS("line")}>
          <span className="font-medium">LINE</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => shareToSNS("discord")}>
          <span className="font-medium">Discord</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => shareToSNS("instagram")}>
          <span className="font-medium">Instagram</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={copyToClipboard}>
          <span className="font-medium">링크 복사</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
