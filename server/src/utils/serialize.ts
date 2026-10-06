import type { IUser, IGame } from '../models/index.js';

export function serializeUser(user: IUser) {
  return {
    id: String(user._id),
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar ?? null,
    bio: user.bio || '',
    location: user.location || '',
    role: user.role,
    isVerified: user.isVerified,
    level: user.level,
    xp: user.xp,
    followersCount: user.followersCount,
    followingCount: user.followingCount,
    roomsHostedCount: user.roomsHostedCount,
    eventsJoinedCount: user.eventsJoinedCount,
    winsCount: user.winsCount,
    giveawaysWonCount: user.giveawaysWonCount,
    socialLinks: user.socialLinks || {},
    favoriteGames: (user.favoriteGames || []).map(String),
    customGames: user.customGames || [],
    interests: user.interests || [],
    badges: user.badges || [],
    achievements: user.achievements || [],
    lastSeenAt: user.lastSeenAt?.toISOString?.() || null,
    createdAt: user.createdAt.toISOString(),
  };
}

export function serializeGame(game: IGame, extra: { roomsLive?: number } = {}) {
  return {
    id: String(game._id),
    name: game.name,
    slug: game.slug,
    description: game.description,
    developer: game.developer,
    officialUrl: game.officialUrl ?? null,
    logo: game.logo ?? null,
    coverImage: game.coverImage ?? null,
    category: game.category,
    isFeatured: game.isFeatured,
    followersCount: game.followersCount,
    roomsLive: extra.roomsLive ?? 0,
  };
}
