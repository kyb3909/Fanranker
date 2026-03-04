import type { Metadata } from 'next'
import { DraftRoomClient } from './draft-client'

export const metadata: Metadata = {
  title: '드래프트 게임',
  description: '실시간 멀티플레이어 드래프트',
}

export default async function DraftRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>
}) {
  const { roomId } = await params

  return <DraftRoomClient roomId={Number(roomId)} />
}
