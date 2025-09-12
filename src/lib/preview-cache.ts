import type { TimingExport } from "@/lib/schemas/timing-import";
import type { DetailedImportPreview } from "@/services/import-preview.service";

interface CachedPreview {
  preview: DetailedImportPreview;
  timingData: TimingExport;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Simple in-memory cache for import previews
 * This will be replaced with Redis in production
 */
class PreviewCache {
  private cache = new Map<string, CachedPreview>();
  private readonly TTL_MINUTES = 15;

  constructor() {
    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanupExpired(), 5 * 60 * 1000);
  }

  /**
   * Store a preview in the cache
   */
  set(
    previewId: string,
    data: {
      preview: DetailedImportPreview;
      timingData: TimingExport;
      userId: string;
    },
  ): void {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.TTL_MINUTES * 60 * 1000);

    this.cache.set(previewId, {
      ...data,
      createdAt: now,
      expiresAt,
    });
  }

  /**
   * Get a preview from the cache
   */
  get(
    previewId: string,
    userId: string,
  ): {
    preview: DetailedImportPreview;
    timingData: TimingExport;
  } | null {
    const cached = this.cache.get(previewId);

    if (!cached) {
      return null;
    }

    // Check if expired
    if (new Date() > cached.expiresAt) {
      this.cache.delete(previewId);
      return null;
    }

    // Check if user matches (security)
    if (cached.userId !== userId) {
      return null;
    }

    return {
      preview: cached.preview,
      timingData: cached.timingData,
    };
  }

  /**
   * Delete a preview from the cache
   */
  delete(previewId: string): void {
    this.cache.delete(previewId);
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): void {
    const now = new Date();
    const keysToDelete: string[] = [];

    this.cache.forEach((value, key) => {
      if (now > value.expiresAt) {
        keysToDelete.push(key);
      }
    });

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }

    if (keysToDelete.length > 0) {
      console.log(`Cleaned up ${keysToDelete.length} expired preview(s)`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  } {
    let oldest: Date | null = null;
    let newest: Date | null = null;

    this.cache.forEach((value) => {
      if (!oldest || value.createdAt < oldest) {
        oldest = value.createdAt;
      }
      if (!newest || value.createdAt > newest) {
        newest = value.createdAt;
      }
    });

    return {
      size: this.cache.size,
      oldestEntry: oldest,
      newestEntry: newest,
    };
  }
}

// Export singleton instance
export const previewCache = new PreviewCache();
