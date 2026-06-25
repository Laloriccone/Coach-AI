export type UserType = 'FREE' | 'PREMIUM';
export type ActiveTab = 'landing' | 'login' | 'dashboard' | 'coach' | 'training' | 'nutrition' | 'settings' | 'pricing' | 'onboarding' | 'catalog' | 'routine' | 'rewards' | 'device';

export interface Message {
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

export interface Reward {
  id: string;
  title: string;
  description: string;
  xpRequired: number;
  unlocked: boolean;
  type: 'discount' | 'feature' | 'exclusive';
}

export interface Workout {
  id: string;
  type: string;
  duration: number;
  intensity: 'low' | 'medium' | 'high';
  date: number;
  energy?: string;
  intensityRaw?: string;
}

export interface DeviceConfig {
  hasDevice: boolean;
  brand?: string;
  model?: string;
  batteryStatus?: number;
  useDaily: boolean;
  primaryMetrics: string[];
  isConnected: boolean;
}

export interface TrainingConfig {
  frequency: string;
  type: string;
  routineSource?: 'manual' | 'pdf' | 'image';
  routineData?: string;
}

export interface UserProfile {
  name?: string;
  lastName?: string;
  sport?: string;
  frequency?: string;
  hardParts?: string[];
  dietaryPreference?: string;
  weightTarget?: number;
  activityLevel?: string;
  age?: number;
  height?: number;
}

export interface UserStats {
  xp: number;
  level: number;
  streak: number;
  tier: UserType;
  isOnboarded: boolean;
  nombre?: string;
  trialStartDate?: number;
  subscriptionType: 'NONE' | 'MONTHLY' | 'ANNUAL';
  goal?: string;
  dailyCalories?: number;
  weight?: number;
  workouts: Workout[];
  profile: UserProfile;
  logoUrl?: string;
  device?: DeviceConfig;
  training?: TrainingConfig;
  linkedSheetId?: string;
  linkedSheetUrl?: string;
  lastSyncTime?: string;
  sleepHours?: number;
  fatigueLevel?: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: 'supplements' | 'equipment' | 'apparel';
  imageUrl: string;
  recommendedReason?: string;
}
