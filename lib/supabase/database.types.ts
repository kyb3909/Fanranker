/**
 * Supabase Database Types
 * Auto-generated from Supabase schema
 *
 * Generated: 2025-01-17
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bookmarks: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string | null
          icon: string | null
          id: string
          name: string
          slug: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          icon?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      comments: {
        Row: {
          content: string
          created_at: string | null
          deleted_at: string | null
          depth: number | null
          id: string
          parent_id: string | null
          path: string[] | null
          post_id: string
          updated_at: string | null
          user_id: string
          vote_count: number | null
        }
        Insert: {
          content: string
          created_at?: string | null
          deleted_at?: string | null
          depth?: number | null
          id?: string
          parent_id?: string | null
          path?: string[] | null
          post_id: string
          updated_at?: string | null
          user_id: string
          vote_count?: number | null
        }
        Update: {
          content?: string
          created_at?: string | null
          deleted_at?: string | null
          depth?: number | null
          id?: string
          parent_id?: string | null
          path?: string[] | null
          post_id?: string
          updated_at?: string | null
          user_id?: string
          vote_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          country_code: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          name_ko: string | null
          sport_type: string
          updated_at: string | null
        }
        Insert: {
          country_code?: string | null
          created_at?: string | null
          id: string
          is_active?: boolean | null
          name: string
          name_ko?: string | null
          sport_type?: string
          updated_at?: string | null
        }
        Update: {
          country_code?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          name_ko?: string | null
          sport_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      match_odds: {
        Row: {
          asian_handicap: Json | null
          both_teams_to_score: Json | null
          correct_score: Json | null
          created_at: string | null
          double_chance: Json | null
          event_id: string | null
          fi: string | null
          first_goal_scorer: Json | null
          full_time_result: Json | null
          goal_line: Json | null
          goals_over_under: Json | null
          half_time_over_under: Json | null
          half_time_result: Json | null
          id: string
          last_goal_scorer: Json | null
          match_id: string
          odds_updated_at: string | null
          raw_odds: Json | null
        }
        Insert: {
          asian_handicap?: Json | null
          both_teams_to_score?: Json | null
          correct_score?: Json | null
          created_at?: string | null
          double_chance?: Json | null
          event_id?: string | null
          fi?: string | null
          first_goal_scorer?: Json | null
          full_time_result?: Json | null
          goal_line?: Json | null
          goals_over_under?: Json | null
          half_time_over_under?: Json | null
          half_time_result?: Json | null
          id?: string
          last_goal_scorer?: Json | null
          match_id: string
          odds_updated_at?: string | null
          raw_odds?: Json | null
        }
        Update: {
          asian_handicap?: Json | null
          both_teams_to_score?: Json | null
          correct_score?: Json | null
          created_at?: string | null
          double_chance?: Json | null
          event_id?: string | null
          fi?: string | null
          first_goal_scorer?: Json | null
          full_time_result?: Json | null
          goal_line?: Json | null
          goals_over_under?: Json | null
          half_time_over_under?: Json | null
          half_time_result?: Json | null
          id?: string
          last_goal_scorer?: Json | null
          match_id?: string
          odds_updated_at?: string | null
          raw_odds?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "match_odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_team_id: string | null
          created_at: string | null
          events: Json | null
          extra: Json | null
          home_team_id: string | null
          id: string
          is_prediction_open: boolean | null
          league_id: string | null
          match_time: string
          prediction_close_time: string | null
          prediction_count: number | null
          score_away: number | null
          score_home: number | null
          scores: Json | null
          sport_type: string
          stats: Json | null
          time_status: number
          updated_at: string | null
        }
        Insert: {
          away_team_id?: string | null
          created_at?: string | null
          events?: Json | null
          extra?: Json | null
          home_team_id?: string | null
          id: string
          is_prediction_open?: boolean | null
          league_id?: string | null
          match_time: string
          prediction_close_time?: string | null
          prediction_count?: number | null
          score_away?: number | null
          score_home?: number | null
          scores?: Json | null
          sport_type?: string
          stats?: Json | null
          time_status?: number
          updated_at?: string | null
        }
        Update: {
          away_team_id?: string | null
          created_at?: string | null
          events?: Json | null
          extra?: Json | null
          home_team_id?: string | null
          id?: string
          is_prediction_open?: boolean | null
          league_id?: string | null
          match_time?: string
          prediction_close_time?: string | null
          prediction_count?: number | null
          score_away?: number | null
          score_home?: number | null
          scores?: Json | null
          sport_type?: string
          stats?: Json | null
          time_status?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          category_id: string
          comment_count: number | null
          community_slug: string | null
          content: Json
          created_at: string | null
          deleted_at: string | null
          id: string
          image: string | null
          is_notice: boolean | null
          temperature: number | null
          title: string
          updated_at: string | null
          user_id: string
          view_count: number | null
          vote_count: number | null
          source_url: string | null
          source_name: string | null
        }
        Insert: {
          category_id: string
          comment_count?: number | null
          community_slug?: string | null
          content: Json
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          image?: string | null
          is_notice?: boolean | null
          temperature?: number | null
          title: string
          updated_at?: string | null
          user_id: string
          view_count?: number | null
          vote_count?: number | null
          source_url?: string | null
          source_name?: string | null
        }
        Update: {
          category_id?: string
          comment_count?: number | null
          community_slug?: string | null
          content?: Json
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          image?: string | null
          is_notice?: boolean | null
          temperature?: number | null
          title?: string
          updated_at?: string | null
          user_id?: string
          view_count?: number | null
          vote_count?: number | null
          source_url?: string | null
          source_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_seasons: {
        Row: {
          created_at: string | null
          description: string | null
          end_date: string
          id: string
          is_active: boolean | null
          league_id: string | null
          name: string
          prize_pool: Json | null
          sport_type: string | null
          start_date: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          end_date: string
          id?: string
          is_active?: boolean | null
          league_id?: string | null
          name: string
          prize_pool?: Json | null
          sport_type?: string | null
          start_date: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          end_date?: string
          id?: string
          is_active?: boolean | null
          league_id?: string | null
          name?: string
          prize_pool?: Json | null
          sport_type?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediction_seasons_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          created_at: string | null
          id: string
          is_correct: boolean | null
          match_id: string
          odds_at_prediction: number | null
          points_wagered: number | null
          points_won: number | null
          potential_win: number | null
          prediction_type: string
          prediction_value: string
          settled_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_correct?: boolean | null
          match_id: string
          odds_at_prediction?: number | null
          points_wagered?: number | null
          points_won?: number | null
          potential_win?: number | null
          prediction_type: string
          prediction_value: string
          settled_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_correct?: boolean | null
          match_id?: string
          odds_at_prediction?: number | null
          points_wagered?: number | null
          points_won?: number | null
          potential_win?: number | null
          prediction_type?: string
          prediction_value?: string
          settled_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          id: string
          nickname: string
          role: string | null
          temperature: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          nickname: string
          role?: string | null
          temperature?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          nickname?: string
          role?: string | null
          temperature?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      teams: {
        Row: {
          country_code: string | null
          created_at: string | null
          id: string
          image_id: string | null
          is_active: boolean | null
          name: string
          name_ko: string | null
          sport_type: string
          updated_at: string | null
        }
        Insert: {
          country_code?: string | null
          created_at?: string | null
          id: string
          image_id?: string | null
          is_active?: boolean | null
          name: string
          name_ko?: string | null
          sport_type?: string
          updated_at?: string | null
        }
        Update: {
          country_code?: string | null
          created_at?: string | null
          id?: string
          image_id?: string | null
          is_active?: boolean | null
          name?: string
          name_ko?: string | null
          sport_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_prediction_stats: {
        Row: {
          badges: Json | null
          best_win_streak: number | null
          correct_predictions: number | null
          created_at: string | null
          current_streak: number | null
          experience_points: number | null
          highest_points: number | null
          id: string
          last_prediction_at: string | null
          level: number | null
          pending_predictions: number | null
          points_lost: number | null
          points_won: number | null
          rank_monthly: number | null
          rank_overall: number | null
          rank_weekly: number | null
          total_points: number | null
          total_predictions: number | null
          updated_at: string | null
          user_id: string
          win_rate: number | null
          worst_lose_streak: number | null
          wrong_predictions: number | null
        }
        Insert: {
          badges?: Json | null
          best_win_streak?: number | null
          correct_predictions?: number | null
          created_at?: string | null
          current_streak?: number | null
          experience_points?: number | null
          highest_points?: number | null
          id?: string
          last_prediction_at?: string | null
          level?: number | null
          pending_predictions?: number | null
          points_lost?: number | null
          points_won?: number | null
          rank_monthly?: number | null
          rank_overall?: number | null
          rank_weekly?: number | null
          total_points?: number | null
          total_predictions?: number | null
          updated_at?: string | null
          user_id: string
          win_rate?: number | null
          worst_lose_streak?: number | null
          wrong_predictions?: number | null
        }
        Update: {
          badges?: Json | null
          best_win_streak?: number | null
          correct_predictions?: number | null
          created_at?: string | null
          current_streak?: number | null
          experience_points?: number | null
          highest_points?: number | null
          id?: string
          last_prediction_at?: string | null
          level?: number | null
          pending_predictions?: number | null
          points_lost?: number | null
          points_won?: number | null
          rank_monthly?: number | null
          rank_overall?: number | null
          rank_weekly?: number | null
          total_points?: number | null
          total_predictions?: number | null
          updated_at?: string | null
          user_id?: string
          win_rate?: number | null
          worst_lose_streak?: number | null
          wrong_predictions?: number | null
        }
        Relationships: []
      }
      user_season_stats: {
        Row: {
          correct_count: number | null
          created_at: string | null
          id: string
          points_earned: number | null
          predictions_count: number | null
          rank_in_season: number | null
          season_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          correct_count?: number | null
          created_at?: string | null
          id?: string
          points_earned?: number | null
          predictions_count?: number | null
          rank_in_season?: number | null
          season_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          correct_count?: number | null
          created_at?: string | null
          id?: string
          points_earned?: number | null
          predictions_count?: number | null
          rank_in_season?: number | null
          season_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_season_stats_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "prediction_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      votes: {
        Row: {
          created_at: string | null
          id: string
          target_id: string
          target_type: string
          updated_at: string | null
          user_id: string
          vote_value: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          target_id: string
          target_type: string
          updated_at?: string | null
          user_id: string
          vote_value: number
        }
        Update: {
          created_at?: string | null
          id?: string
          target_id?: string
          target_type?: string
          updated_at?: string | null
          user_id?: string
          vote_value?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_vote: {
        Args: { p_target_id: string; p_target_type: string; p_user_id: string }
        Returns: number
      }
      is_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_bookmarked: {
        Args: { p_post_id: string; p_user_id: string }
        Returns: boolean
      }
      is_moderator_or_admin: { Args: { p_user_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
