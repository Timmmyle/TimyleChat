'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { syncUser } from './actions'
import { MessageSquare, Mail, Lock, User, Sparkles, Loader2 } from 'lucide-react'

export default function AuthPage() {
  const router = useRouter()
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Kiểm tra nếu người dùng đã đăng nhập, chuyển sang trang chat
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        router.push('/chat')
      }
    }
    checkSession()
  }, [router])

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      if (isLogin) {
        // Đăng nhập bằng Supabase Auth
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error

        if (data.user) {
          // Đồng bộ user qua database Prisma
          await syncUser(data.user.id, data.user.email!, username || undefined)
          router.push('/chat')
        }
      } else {
        // Đăng ký bằng Supabase Auth
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        })
        if (error) throw error

        if (data.user) {
          // Đồng bộ user qua database Prisma
          await syncUser(data.user.id, data.user.email!, username || undefined)
          setSuccessMsg('Đăng ký tài khoản thành công! Hãy đăng nhập để tiếp tục.')
          setIsLogin(true)
          setPassword('')
        }
      }
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || 'Có lỗi xảy ra, vui lòng thử lại!')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-teal-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Auth Card Container */}
      <div className="w-full max-w-md relative z-10">
        {/* Logo and header */}
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-teal-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-teal-500/10 mb-4 animate-pulse">
            <MessageSquare className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-100 flex items-center gap-2">
            TimyleChat <Sparkles className="w-5 h-5 text-teal-400" />
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            Trò chuyện thời gian thực với trải nghiệm tối dịu mắt
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl relative">
          {/* Tabs */}
          <div className="grid grid-cols-2 bg-slate-950/80 p-1.5 rounded-2xl mb-8 border border-slate-800/80">
            <button
              type="button"
              onClick={() => { setIsLogin(true); setErrorMsg(''); setSuccessMsg(''); }}
              className={`py-2 text-sm font-semibold rounded-xl transition-all duration-300 ${isLogin
                  ? 'bg-slate-800 text-teal-400 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => { setIsLogin(false); setErrorMsg(''); setSuccessMsg(''); }}
              className={`py-2 text-sm font-semibold rounded-xl transition-all duration-300 ${!isLogin
                  ? 'bg-slate-800 text-teal-400 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              Đăng ký
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleAuth} className="space-y-6">
            {errorMsg && (
              <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs text-center font-medium">
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs text-center font-medium">
                {successMsg}
              </div>
            )}

            {!isLogin && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 tracking-wide uppercase">Tên người dùng</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <User className="w-5 h-5" />
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="skywalker"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-950/80 border border-slate-800 hover:border-slate-700 focus:border-teal-500/70 focus:ring-1 focus:ring-teal-500/30 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none transition-all"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 tracking-wide uppercase">Email</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-5 h-5" />
                </span>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-950/80 border border-slate-800 hover:border-slate-700 focus:border-teal-500/70 focus:ring-1 focus:ring-teal-500/30 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 tracking-wide uppercase">Mật khẩu</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-5 h-5" />
                </span>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-950/80 border border-slate-800 hover:border-slate-700 focus:border-teal-500/70 focus:ring-1 focus:ring-teal-500/30 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-indigo-600 hover:from-teal-400 hover:to-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-teal-900/20 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                isLogin ? 'Đăng nhập' : 'Đăng ký tài khoản'
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
