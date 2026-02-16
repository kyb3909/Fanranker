"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "@clerk/nextjs"
import { Film, CheckCircle2, XCircle, ChevronRight, Trophy, Clock, Loader2, RotateCcw, Sparkles } from "lucide-react"

interface Quiz {
  id: string
  category: string
  difficulty: string
  question: string
  image_url: string | null
  choices: string[]
  movie_title: string
  movie_year: number
  points: number
  already_answered: boolean
}

interface AnswerResult {
  is_correct: boolean
  correct_answer: number
  points_earned: number
  explanation: string
  movie_title: string
}

const CATEGORY_LABELS: Record<string, string> = {
  all: "전체",
  quote: "명대사",
  actor: "배우",
  trivia: "상식",
  scene: "장면",
  ost: "OST",
  poster: "포스터",
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  normal: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  hard: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
}

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "쉬움",
  normal: "보통",
  hard: "어려움",
}

export default function MovieQuizPage() {
  const { isSignedIn } = useAuth()
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [category, setCategory] = useState("all")
  const [totalScore, setTotalScore] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [answeredCount, setAnsweredCount] = useState(0)
  const [gameFinished, setGameFinished] = useState(false)
  const [timer, setTimer] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)

  const fetchQuizzes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/games/movie-quiz?category=${category}&limit=10`)
      const data = await res.json()
      if (res.ok) {
        // Filter out already answered ones
        const unanswered = (data.quizzes || []).filter((q: Quiz) => !q.already_answered)
        setQuizzes(unanswered.length > 0 ? unanswered : data.quizzes || [])
        setCurrentIndex(0)
        setSelectedAnswer(null)
        setResult(null)
        setTotalScore(0)
        setCorrectCount(0)
        setAnsweredCount(0)
        setGameFinished(false)
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [category])

  useEffect(() => {
    fetchQuizzes()
  }, [fetchQuizzes])

  // Timer
  useEffect(() => {
    if (!loading && quizzes.length > 0 && !result && !gameFinished) {
      startTimeRef.current = Date.now()
      setTimer(0)
      timerRef.current = setInterval(() => {
        setTimer(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [currentIndex, loading, quizzes.length, result, gameFinished])

  const currentQuiz = quizzes[currentIndex]

  const handleSubmit = async (answerIndex: number) => {
    if (submitting || result || !currentQuiz) return
    setSelectedAnswer(answerIndex)
    setSubmitting(true)

    if (timerRef.current) clearInterval(timerRef.current)
    const timeTaken = Date.now() - startTimeRef.current

    if (!isSignedIn) {
      // Offline mode: show answer without saving
      setResult({
        is_correct: false,
        correct_answer: -1,
        points_earned: 0,
        explanation: "로그인하면 점수가 기록됩니다.",
        movie_title: currentQuiz.movie_title,
      })
      setSubmitting(false)
      return
    }

    try {
      const res = await fetch("/api/games/movie-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quiz_id: currentQuiz.id,
          selected_answer: answerIndex,
          time_taken_ms: timeTaken,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult(data)
        setAnsweredCount((prev) => prev + 1)
        if (data.is_correct) {
          setTotalScore((prev) => prev + data.points_earned)
          setCorrectCount((prev) => prev + 1)
        }
      } else if (res.status === 409) {
        // Already answered, skip
        handleNext()
      }
    } catch {
      // silently fail
    } finally {
      setSubmitting(false)
    }
  }

  const handleNext = () => {
    if (currentIndex + 1 >= quizzes.length) {
      setGameFinished(true)
    } else {
      setCurrentIndex((prev) => prev + 1)
      setSelectedAnswer(null)
      setResult(null)
    }
  }

  const handleRestart = () => {
    fetchQuizzes()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (quizzes.length === 0) {
    return (
      <div className="text-center py-20">
        <Film className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">퀴즈가 없습니다.</p>
      </div>
    )
  }

  // Game finished screen
  if (gameFinished) {
    const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0
    return (
      <div className="max-w-lg mx-auto text-center py-10">
        <div className="bg-card border border-border rounded-2xl p-8">
          <Sparkles className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">퀴즈 완료!</h2>
          <p className="text-sm text-muted-foreground mb-6">모든 문제를 풀었습니다</p>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-2xl font-bold text-foreground">{totalScore}</p>
              <p className="text-xs text-muted-foreground">총 점수</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-2xl font-bold text-emerald-600">{correctCount}/{answeredCount}</p>
              <p className="text-xs text-muted-foreground">정답</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-2xl font-bold text-foreground">{accuracy}%</p>
              <p className="text-xs text-muted-foreground">정답률</p>
            </div>
          </div>

          <button
            onClick={handleRestart}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            다시 풀기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">영화 퀴즈</h1>
          <p className="text-sm text-muted-foreground mt-0.5">영화 지식을 테스트해보세요</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-1.5 text-amber-600">
            <Trophy className="h-4 w-4" />
            <span className="font-semibold">{totalScore}점</span>
          </div>
          <div className="text-muted-foreground">
            {currentIndex + 1}/{quizzes.length}
          </div>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              category === key
                ? "bg-rose-500 text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-rose-500 to-pink-500 rounded-full transition-all duration-500"
          style={{ width: `${((currentIndex + (result ? 1 : 0)) / quizzes.length) * 100}%` }}
        />
      </div>

      {/* Quiz card */}
      {currentQuiz && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {/* Quiz header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${DIFFICULTY_COLORS[currentQuiz.difficulty]}`}>
                {DIFFICULTY_LABELS[currentQuiz.difficulty]}
              </span>
              <span className="text-xs text-muted-foreground">
                {CATEGORY_LABELS[currentQuiz.category] || currentQuiz.category}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{timer}초</span>
              <span className="mx-1">|</span>
              <span className="text-amber-600 font-medium">{currentQuiz.points}점</span>
            </div>
          </div>

          {/* Question */}
          <div className="p-5">
            <h2 className="text-base font-semibold text-foreground leading-relaxed mb-5">
              {currentQuiz.question}
            </h2>

            {/* Choices */}
            <div className="space-y-2.5">
              {currentQuiz.choices.map((choice: string, idx: number) => {
                let choiceStyle = "bg-muted/40 hover:bg-muted/60 border-border text-foreground"

                if (result) {
                  if (idx === result.correct_answer) {
                    choiceStyle = "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400"
                  } else if (idx === selectedAnswer && !result.is_correct) {
                    choiceStyle = "bg-rose-50 dark:bg-rose-900/20 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-400"
                  } else {
                    choiceStyle = "bg-muted/20 border-border/50 text-muted-foreground"
                  }
                } else if (idx === selectedAnswer) {
                  choiceStyle = "bg-primary/10 border-primary ring-2 ring-primary/30 text-foreground"
                }

                return (
                  <button
                    key={idx}
                    onClick={() => handleSubmit(idx)}
                    disabled={!!result || submitting}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left ${choiceStyle} ${
                      !result && !submitting ? "cursor-pointer" : ""
                    }`}
                  >
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-background border border-border flex items-center justify-center text-xs font-medium">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="text-sm flex-1">{choice}</span>
                    {result && idx === result.correct_answer && (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                    )}
                    {result && idx === selectedAnswer && !result.is_correct && (
                      <XCircle className="h-5 w-5 text-rose-500 flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Result explanation */}
            {result && (
              <div className={`mt-4 p-4 rounded-xl text-sm ${
                result.is_correct
                  ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
                  : "bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800"
              }`}>
                <p className={`font-semibold mb-1 ${result.is_correct ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                  {result.is_correct ? `정답! +${result.points_earned}점` : "오답!"}
                </p>
                {result.explanation && (
                  <p className="text-muted-foreground">{result.explanation}</p>
                )}
              </div>
            )}

            {/* Next button */}
            {result && (
              <button
                onClick={handleNext}
                className="mt-4 w-full flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                {currentIndex + 1 >= quizzes.length ? "결과 보기" : "다음 문제"}
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
