// Daily.co API helper for creating and managing video rooms
// Requires DAILY_API_KEY environment variable (get from https://dashboard.daily.co/developers)

const DAILY_API_URL = "https://api.daily.co/v1";

interface DailyRoomConfig {
  name: string;
  privacy?: "public" | "private";
  properties?: {
    exp?: number;
    max_participants?: number;
    enable_chat?: boolean;
    enable_screenshare?: boolean;
    start_audio_off?: boolean;
    start_video_off?: boolean;
    lang?: string;
  };
}

interface DailyRoom {
  id: string;
  name: string;
  url: string;
  privacy: string;
  created_at: string;
  config: Record<string, unknown>;
}

export async function createDailyRoom(roomName: string, expiryMinutes: number = 60): Promise<DailyRoom> {
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey) {
    throw new Error("DAILY_API_KEY is not configured. Get it from https://dashboard.daily.co/developers");
  }

  const exp = Math.round(Date.now() / 1000) + expiryMinutes * 60;

  const config: DailyRoomConfig = {
    name: roomName,
    privacy: "public",
    properties: {
      exp,
      max_participants: 4,
      enable_chat: true,
      enable_screenshare: true,
      start_audio_off: false,
      start_video_off: false,
      lang: "es",
    },
  };

  const response = await fetch(`${DAILY_API_URL}/rooms`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    // If room already exists, try to fetch it
    if (response.status === 400) {
      const existing = await getDailyRoom(roomName);
      if (existing) return existing;
    }
    const error = await response.text();
    throw new Error(`Daily.co API error (${response.status}): ${error}`);
  }

  return response.json();
}

export async function getDailyRoom(roomName: string): Promise<DailyRoom | null> {
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey) return null;

  const response = await fetch(`${DAILY_API_URL}/rooms/${roomName}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) return null;
  return response.json();
}

export async function deleteDailyRoom(roomName: string): Promise<boolean> {
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey) return false;

  const response = await fetch(`${DAILY_API_URL}/rooms/${roomName}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  return response.ok;
}
