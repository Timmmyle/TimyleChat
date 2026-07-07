'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  getRooms,
  getMessages,
  sendMessage,
  getAllUsers,
  createRoom,
  syncUser,
  getFriends,
  getPendingRequests,
  sendFriendRequest,
  respondToFriendRequest,
  addMembersToRoom
} from '../actions'
import {
  LogOut,
  Plus,
  Send,
  User,
  Users,
  MessageSquare,
  Sparkles,
  Loader2,
  X,
  Check,
  UserPlus,
  UserCheck,
  UserX,
  AlertCircle,
  Paperclip,
  File,
  Download,
  Info,
  ChevronDown,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  PlusCircle
} from 'lucide-react'

interface DBUser {
  id: string
  email: string
  username: string | null
  avatarUrl: string | null
}

interface DBRoom {
  id: string
  name: string | null
  type: 'DIRECT' | 'GROUP'
  members: {
    user: DBUser
  }[]
  messages?: {
    content: string
    createdAt: Date
  }[]
}

interface DBMessage {
  id: string
  content: string
  roomId: string
  senderId: string
  createdAt: Date
  sender: DBUser
  fileUrl?: string | null
  fileName?: string | null
  fileType?: string | null
}

export default function ChatPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<DBUser | null>(null)

  // Navigation Tab
  const [activeTab, setActiveTab] = useState<'CHATS' | 'FRIENDS'>('CHATS')

  // Chat States
  const [rooms, setRooms] = useState<DBRoom[]>([])
  const [selectedRoom, setSelectedRoom] = useState<DBRoom | null>(null)
  const [messages, setMessages] = useState<DBMessage[]>([])
  const [inputText, setInputText] = useState('')

  // Friend States
  const [friends, setFriends] = useState<DBUser[]>([])
  const [incomingRequests, setIncomingRequests] = useState<any[]>([])
  const [outgoingRequests, setOutgoingRequests] = useState<any[]>([])
  const [friendInput, setFriendInput] = useState('')
  const [friendReqLoading, setFriendReqLoading] = useState(false)
  const [friendReqError, setFriendReqError] = useState('')
  const [friendReqSuccess, setFriendReqSuccess] = useState('')

  // Modal State (For creating chat room using Friends list)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalType, setModalType] = useState<'DIRECT' | 'GROUP'>('DIRECT')
  const [groupName, setGroupName] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])

  // UI loading states
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [creating, setCreating] = useState(false)

  // Online Presence
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([])

  // File Uploading States
  const [fileUploading, setFileUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Right Sidebar (Group Info)
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false)
  const [addMemberSelectedIds, setAddMemberSelectedIds] = useState<string[]>([])
  const [addingMembers, setAddingMembers] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 1. Kiểm tra xác thực & Đồng bộ thông tin User
  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/')
        return
      }

      const sUser = session.user
      const syncResult = await syncUser(
        sUser.id,
        sUser.email!,
        sUser.user_metadata?.username,
        sUser.user_metadata?.avatar_url
      )

      if (syncResult.success && syncResult.user) {
        setCurrentUser(syncResult.user as DBUser)
        await loadInitialData(sUser.id)
      } else {
        console.error('Không thể đồng bộ người dùng:', syncResult.error)
        setLoading(false)
      }
    }

    fetchSession()
  }, [router])

  // Tải dữ liệu phòng chat, danh sách bạn bè và lời mời kết bạn
  const loadInitialData = async (userId: string) => {
    try {
      const [roomsRes, friendsRes, requestsRes] = await Promise.all([
        getRooms(userId),
        getFriends(userId),
        getPendingRequests(userId)
      ])

      if (roomsRes.success && roomsRes.rooms) {
        setRooms(roomsRes.rooms as DBRoom[])
      }
      if (friendsRes.success && friendsRes.friends) {
        setFriends(friendsRes.friends as DBUser[])
      }
      if (requestsRes.success && requestsRes.incoming && requestsRes.outgoing) {
        setIncomingRequests(requestsRes.incoming)
        setOutgoingRequests(requestsRes.outgoing)
      }
    } catch (error) {
      console.error('Lỗi tải dữ liệu ban đầu:', error)
    } finally {
      setLoading(false)
    }
  }

  // Tải lại riêng danh sách bạn bè & lời mời kết bạn
  const reloadFriendsData = async () => {
    if (!currentUser) return
    try {
      const [friendsRes, requestsRes] = await Promise.all([
        getFriends(currentUser.id),
        getPendingRequests(currentUser.id)
      ])
      if (friendsRes.success && friendsRes.friends) {
        setFriends(friendsRes.friends as DBUser[])
      }
      if (requestsRes.success && requestsRes.incoming && requestsRes.outgoing) {
        setIncomingRequests(requestsRes.incoming)
        setOutgoingRequests(requestsRes.outgoing)
      }
    } catch (error) {
      console.error('Lỗi tải lại dữ liệu bạn bè:', error)
    }
  }

  // 1.5. Lắng nghe thay đổi kết bạn và thành viên phòng realtime (Refresh vô hình)
  useEffect(() => {
    if (!currentUser) return

    // Lắng nghe thay đổi kết bạn khi mình là người gửi
    const friendshipSenderChannel = supabase
      .channel(`friendships-sender-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'Friendship',
          filter: `senderId=eq.${currentUser.id}`
        },
        () => {
          reloadFriendsData()
          getRooms(currentUser.id).then((res) => {
            if (res.success && res.rooms) setRooms(res.rooms as DBRoom[])
          })
        }
      )
      .subscribe()

    // Lắng nghe thay đổi kết bạn khi mình là người nhận
    const friendshipReceiverChannel = supabase
      .channel(`friendships-receiver-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'Friendship',
          filter: `receiverId=eq.${currentUser.id}`
        },
        () => {
          reloadFriendsData()
          getRooms(currentUser.id).then((res) => {
            if (res.success && res.rooms) setRooms(res.rooms as DBRoom[])
          })
        }
      )
      .subscribe()

    // Lắng nghe khi được thêm vào phòng chat/nhóm chat mới
    const roomMemberChannel = supabase
      .channel(`room-members-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'RoomMember',
          filter: `userId=eq.${currentUser.id}`
        },
        () => {
          getRooms(currentUser.id).then((res) => {
            if (res.success && res.rooms) setRooms(res.rooms as DBRoom[])
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(friendshipSenderChannel)
      supabase.removeChannel(friendshipReceiverChannel)
      supabase.removeChannel(roomMemberChannel)
    }
  }, [currentUser])

  // 1.6. Đăng ký Presence (Theo dõi trạng thái online/offline)
  useEffect(() => {
    if (!currentUser) return

    // Đăng ký kênh online-users để gửi trạng thái online của mình và nhận danh sách online
    const presenceChannel = supabase.channel('online-users', {
      config: {
        presence: {
          key: currentUser.id,
        },
      },
    })

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState()
        const onlineIds = Object.keys(state)
        setOnlineUserIds(onlineIds)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            online_at: new Date().toISOString(),
          })
        }
      })

    return () => {
      supabase.removeChannel(presenceChannel)
    }
  }, [currentUser])

  // Tự động cuộn xuống cuối danh sách tin nhắn
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // 2. Tải tin nhắn và lắng nghe Realtime khi chọn Phòng
  useEffect(() => {
    if (!selectedRoom) return

    const loadMessages = async () => {
      const res = await getMessages(selectedRoom.id)
      if (res.success && res.messages) {
        setMessages(res.messages as DBMessage[])
      }
    }
    loadMessages()

    const channel = supabase
      .channel(`room-${selectedRoom.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'Message',
          filter: `roomId=eq.${selectedRoom.id}`
        },
        async (payload) => {
          const newMsg = payload.new as any

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            const sender = selectedRoom.members.find((m) => m.user.id === newMsg.senderId)?.user || {
              id: newMsg.senderId,
              email: '',
              username: 'Người dùng',
              avatarUrl: null
            }

            return [
              ...prev,
              {
                ...newMsg,
                createdAt: new Date(newMsg.createdAt),
                sender
              } as DBMessage
            ]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedRoom])

  // Gửi tin nhắn
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputText.trim() || !selectedRoom || !currentUser || sending) return

    const text = inputText.trim()
    setInputText('')
    setSending(true)

    try {
      const res = await sendMessage(selectedRoom.id, currentUser.id, text)
      if (res.success && res.message) {
        const msg = {
          ...res.message,
          createdAt: new Date(res.message.createdAt)
        } as DBMessage

        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev
          return [...prev, msg]
        })

        const roomsRes = await getRooms(currentUser.id)
        if (roomsRes.success && roomsRes.rooms) {
          setRooms(roomsRes.rooms as DBRoom[])
        }
      }
    } catch (error) {
      console.error('Lỗi gửi tin nhắn:', error)
    } finally {
      setSending(false)
    }
  }

  // Tải tệp tin / hình ảnh lên Supabase Storage (Tối đa 25MB)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedRoom || !currentUser) return

    // Kiểm tra kích thước (tối đa 25MB)
    const MAX_SIZE = 25 * 1024 * 1024 // 25 MB
    if (file.size > MAX_SIZE) {
      alert('Kích thước tệp tin vượt quá giới hạn 25MB!')
      return
    }

    setFileUploading(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`
      const filePath = `${selectedRoom.id}/${fileName}`

      // Upload file lên Supabase Storage bucket 'chat-attachments'
      const { data, error } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, file)

      if (error) throw error

      // Lấy public URL
      const { data: { publicUrl } } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(filePath)

      const isImage = file.type.startsWith('image/')
      const fileType = isImage ? 'image' : 'file'

      // Gửi tin nhắn chứa thông tin tệp tin đính kèm
      const res = await sendMessage(
        selectedRoom.id,
        currentUser.id,
        file.name, // Nội dung chính là tên tệp
        publicUrl,
        file.name,
        fileType
      )

      if (res.success && res.message) {
        const msg = {
          ...res.message,
          createdAt: new Date(res.message.createdAt)
        } as DBMessage

        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev
          return [...prev, msg]
        })

        const roomsRes = await getRooms(currentUser.id)
        if (roomsRes.success && roomsRes.rooms) {
          setRooms(roomsRes.rooms as DBRoom[])
        }
      }
    } catch (error: any) {
      console.error('Lỗi tải tệp lên:', error)
      alert('Tải tệp đính kèm thất bại: ' + (error.message || 'Lỗi không xác định'))
    } finally {
      setFileUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Thêm thành viên bạn bè vào phòng chat nhóm
  const handleAddMembers = async () => {
    if (!selectedRoom || addMemberSelectedIds.length === 0 || addingMembers) return
    setAddingMembers(true)
    try {
      const res = await addMembersToRoom(selectedRoom.id, addMemberSelectedIds)
      if (res.success) {
        if (currentUser) {
          const roomsRes = await getRooms(currentUser.id)
          if (roomsRes.success && roomsRes.rooms) {
            const updatedRooms = roomsRes.rooms as DBRoom[]
            setRooms(updatedRooms)
            const updatedSelectedRoom = updatedRooms.find((r) => r.id === selectedRoom.id)
            if (updatedSelectedRoom) setSelectedRoom(updatedSelectedRoom)
          }
        }
        setIsAddMemberModalOpen(false)
        setAddMemberSelectedIds([])
      } else {
        alert('Lỗi thêm thành viên: ' + res.error)
      }
    } catch (error: any) {
      console.error(error)
      alert('Lỗi thêm thành viên!')
    } finally {
      setAddingMembers(false)
    }
  }

  // Đăng xuất
  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  // Gửi yêu cầu kết bạn
  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!friendInput.trim() || !currentUser || friendReqLoading) return

    setFriendReqLoading(true)
    setFriendReqError('')
    setFriendReqSuccess('')

    try {
      const res = await sendFriendRequest(currentUser.id, friendInput.trim())
      if (res.success) {
        setFriendReqSuccess('Đã gửi lời mời kết bạn thành công!')
        setFriendInput('')
        await reloadFriendsData()
      } else {
        setFriendReqError(res.error || 'Có lỗi xảy ra!')
      }
    } catch (error: any) {
      setFriendReqError(error.message || 'Lỗi hệ thống!')
    } finally {
      setFriendReqLoading(false)
    }
  }

  // Phản hồi yêu cầu kết bạn (Chấp nhận / Từ chối)
  const handleFriendResponse = async (requestId: string, action: 'ACCEPTED' | 'DECLINED') => {
    try {
      const res = await respondToFriendRequest(requestId, action)
      if (res.success) {
        await reloadFriendsData()
        // Cập nhật lại danh sách phòng (nếu đồng ý, có thể cần lấy thông tin phòng chat 1-1)
        if (currentUser) {
          const roomsRes = await getRooms(currentUser.id)
          if (roomsRes.success && roomsRes.rooms) {
            setRooms(roomsRes.rooms as DBRoom[])
          }
        }
      }
    } catch (error) {
      console.error('Lỗi phản hồi yêu cầu kết bạn:', error)
    }
  }

  // Bắt đầu Chat trực tiếp (1-1) từ danh sách Bạn bè
  const startChatWithFriend = async (friendId: string) => {
    if (!currentUser) return
    setLoading(true)
    try {
      const res = await createRoom(currentUser.id, [friendId], undefined, 'DIRECT')
      if (res.success && res.roomId) {
        const roomsRes = await getRooms(currentUser.id)
        let updatedRooms: DBRoom[] = []
        if (roomsRes.success && roomsRes.rooms) {
          updatedRooms = roomsRes.rooms as DBRoom[]
          setRooms(updatedRooms)
        }

        const targetRoom = updatedRooms.find((r) => r.id === res.roomId)
        if (targetRoom) {
          setSelectedRoom(targetRoom)
        }
        setActiveTab('CHATS')
      }
    } catch (error) {
      console.error('Lỗi khởi tạo chat với bạn bè:', error)
    } finally {
      setLoading(false)
    }
  }

  // Tạo phòng chat mới (Direct 1-1 hoặc Group) từ Modal Bạn bè
  const handleCreateRoom = async () => {
    if (!currentUser || creating) return
    if (modalType === 'GROUP' && !groupName.trim()) return
    if (selectedMembers.length === 0) return

    setCreating(true)
    try {
      const res = await createRoom(
        currentUser.id,
        selectedMembers,
        modalType === 'GROUP' ? groupName : undefined,
        modalType
      )

      if (res.success && res.roomId) {
        const roomsRes = await getRooms(currentUser.id)
        let updatedRooms: DBRoom[] = []
        if (roomsRes.success && roomsRes.rooms) {
          updatedRooms = roomsRes.rooms as DBRoom[]
          setRooms(updatedRooms)
        }

        const newRoom = updatedRooms.find((r) => r.id === res.roomId)
        if (newRoom) {
          setSelectedRoom(newRoom)
        }

        setIsModalOpen(false)
        setGroupName('')
        setSelectedMembers([])
      }
    } catch (error) {
      console.error('Lỗi tạo phòng:', error)
    } finally {
      setCreating(false)
    }
  }

  const toggleMemberSelection = (userId: string) => {
    if (modalType === 'DIRECT') {
      setSelectedMembers([userId])
    } else {
      setSelectedMembers((prev) =>
        prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
      )
    }
  }

  const getRoomDisplayName = (room: DBRoom) => {
    if (room.type === 'GROUP') return room.name || 'Phòng chat nhóm'
    const partner = room.members.find((m) => m.user.id !== currentUser?.id)?.user
    return partner?.username || partner?.email?.split('@')[0] || 'Người dùng Aether'
  }

  const getRoomAvatar = (room: DBRoom) => {
    if (room.type === 'GROUP') return null
    const partner = room.members.find((m) => m.user.id !== currentUser?.id)?.user
    return partner?.avatarUrl || null
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="w-10 h-10 animate-spin text-teal-400 mb-4" />
        <p className="text-sm tracking-wide font-medium">Đang đồng bộ AetherChat...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 flex text-slate-200 relative overflow-hidden h-screen">
      {/* Background ambient light */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-teal-500/5 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[150px] pointer-events-none" />

      {/* 1. SIDEBAR */}
      <aside className="w-80 border-r border-slate-900 bg-slate-950/60 backdrop-blur-xl flex flex-col h-full z-10">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-teal-500 to-indigo-600 flex items-center justify-center shadow-md shadow-teal-500/10">
              <MessageSquare className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="font-extrabold text-slate-100 tracking-tight flex items-center gap-1">
              Aether <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            </span>
          </div>

          <button
            onClick={handleLogout}
            title="Đăng xuất"
            className="p-2 hover:bg-slate-900 rounded-xl text-slate-400 hover:text-red-400 transition cursor-pointer"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* User Profile Bar */}
        {currentUser && (
          <div className="p-4 bg-slate-900/20 border-b border-slate-900/80 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-teal-400 flex items-center justify-center text-white font-bold text-sm shadow-inner uppercase">
              {currentUser.avatarUrl ? (
                <img src={currentUser.avatarUrl} alt="Avatar" className="w-full h-full object-cover rounded-xl" />
              ) : (
                currentUser.username?.[0] || currentUser.email[0]
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-200 truncate">{currentUser.username}</p>
              <span className="text-[10px] text-teal-400 font-medium tracking-wider uppercase flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-ping" />
                Trực tuyến
              </span>
            </div>
          </div>
        )}

        {/* Tab Controls */}
        <div className="grid grid-cols-2 bg-slate-950/80 p-1 border-b border-slate-900 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('CHATS')}
            className={`py-3 text-center border-b-2 transition ${activeTab === 'CHATS'
                ? 'border-teal-400 text-teal-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
          >
            HỘI THOẠI ({rooms.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('FRIENDS')
              reloadFriendsData()
            }}
            className={`py-3 text-center border-b-2 transition relative ${activeTab === 'FRIENDS'
                ? 'border-teal-400 text-teal-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
          >
            BẠN BÈ ({friends.length})
            {incomingRequests.length > 0 && (
              <span className="absolute top-2 right-4 w-4 h-4 bg-teal-500 text-slate-950 font-bold rounded-full text-[9px] flex items-center justify-center animate-bounce">
                {incomingRequests.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
          {activeTab === 'CHATS' ? (
            /* --- CHAT TAB --- */
            <>
              <div className="p-2 pt-0 flex items-center justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                <span>Danh sách chat</span>
                <button
                  onClick={() => {
                    setModalType('DIRECT')
                    setIsModalOpen(true)
                  }}
                  className="p-1 bg-slate-900 hover:bg-slate-800 text-teal-400 hover:text-teal-300 rounded-lg border border-slate-800 transition flex items-center gap-1 px-2 cursor-pointer uppercase text-[9px]"
                >
                  <Plus className="w-3 h-3" /> Tạo chat
                </button>
              </div>

              {rooms.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-600">
                  Chưa có phòng chat.<br />Hãy thêm bạn bè rồi tạo chat!
                </div>
              ) : (
                rooms.map((room) => {
                  const isSelected = selectedRoom?.id === room.id
                  const hasAvatar = getRoomAvatar(room)
                  const name = getRoomDisplayName(room)

                  return (
                    <button
                      key={room.id}
                      onClick={() => setSelectedRoom(room)}
                      className={`w-full text-left p-3 rounded-2xl flex items-center gap-3 transition-all duration-200 ${isSelected
                          ? 'bg-slate-900 border border-slate-800 text-slate-100'
                          : 'hover:bg-slate-900/40 text-slate-400 hover:text-slate-200 border border-transparent'
                        }`}
                    >
                      <div className="relative">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shadow-inner ${room.type === 'GROUP'
                            ? 'bg-indigo-950 text-indigo-400 border border-indigo-900/50'
                            : 'bg-slate-800 text-teal-400 border border-slate-700/50'
                          }`}>
                          {room.type === 'GROUP' ? (
                            <Users className="w-5 h-5" />
                          ) : hasAvatar ? (
                            <img src={hasAvatar} alt="Avatar" className="w-full h-full object-cover rounded-xl" />
                          ) : (
                            name[0].toUpperCase()
                          )}
                        </div>
                        {/* Dot online cho chat Direct */}
                        {room.type === 'DIRECT' && (() => {
                          const partner = room.members.find((m) => m.user.id !== currentUser?.id)?.user
                          const isOnline = partner && onlineUserIds.includes(partner.id)
                          return isOnline ? (
                            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-950 rounded-full" />
                          ) : null
                        })()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${isSelected ? 'text-slate-100' : 'text-slate-300'}`}>
                          {name}
                        </p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {room.type === 'GROUP' ? 'Nhóm chat' : 'Tin nhắn riêng'}
                        </p>
                      </div>
                    </button>
                  )
                })
              )}
            </>
          ) : (
            /* --- FRIENDS TAB --- */
            <div className="space-y-6 px-1">
              {/* Form Add Friend */}
              <div className="bg-slate-900/30 border border-slate-900 p-3.5 rounded-2xl space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Thêm bạn bè</p>
                <form onSubmit={handleAddFriend} className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Email hoặc username..."
                    value={friendInput}
                    onChange={(e) => setFriendInput(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800/80 hover:border-slate-700/80 focus:border-teal-500/70 focus:ring-1 focus:ring-teal-500/30 rounded-xl p-2 px-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none transition"
                  />
                  <button
                    type="submit"
                    disabled={friendReqLoading}
                    className="bg-teal-500 hover:bg-teal-400 text-slate-950 p-2 rounded-xl transition cursor-pointer flex items-center justify-center disabled:opacity-50"
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>
                </form>
                {friendReqError && (
                  <p className="text-[10px] text-red-400 flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3.5 h-3.5" /> {friendReqError}
                  </p>
                )}
                {friendReqSuccess && (
                  <p className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                    <Check className="w-3.5 h-3.5" /> {friendReqSuccess}
                  </p>
                )}
              </div>

              {/* Pending Invites */}
              {incomingRequests.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                    Lời mời kết bạn ({incomingRequests.length})
                  </p>
                  <div className="space-y-1.5">
                    {incomingRequests.map((req) => (
                      <div
                        key={req.id}
                        className="bg-slate-900/40 border border-slate-900 rounded-xl p-2.5 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-bold uppercase text-teal-400">
                            {req.sender.username?.[0] || '?'}
                          </div>
                          <span className="text-xs font-semibold text-slate-300 truncate">
                            {req.sender.username}
                          </span>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleFriendResponse(req.id, 'ACCEPTED')}
                            title="Chấp nhận"
                            className="p-1 bg-teal-500/10 hover:bg-teal-500 text-teal-400 hover:text-slate-950 rounded-lg border border-teal-500/20 transition cursor-pointer"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleFriendResponse(req.id, 'DECLINED')}
                            title="Từ chối"
                            className="p-1 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-lg border border-red-500/20 transition cursor-pointer"
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Friend List */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                  Danh sách bạn bè ({friends.length})
                </p>
                {friends.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-600">
                    Chưa có bạn bè.<br />Hãy gửi lời mời kết bạn ở trên!
                  </div>
                ) : (
                  <div className="space-y-1">
                    {friends.map((friend) => {
                      const isOnline = onlineUserIds.includes(friend.id)
                      return (
                        <div
                          key={friend.id}
                          className="p-2.5 rounded-xl border border-transparent hover:border-slate-900 hover:bg-slate-900/20 flex items-center justify-between group transition"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="relative">
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-slate-800 to-slate-700 flex items-center justify-center text-xs font-bold uppercase text-teal-400 shadow-inner">
                                {friend.avatarUrl ? (
                                  <img src={friend.avatarUrl} alt="Avatar" className="w-full h-full object-cover rounded-lg" />
                                ) : (
                                  friend.username?.[0] || '?'
                                )}
                              </div>
                              {isOnline && (
                                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border border-slate-950 rounded-full" />
                              )}
                            </div>
                            <span className="text-xs font-semibold text-slate-300 truncate">
                              {friend.username}
                            </span>
                          </div>
                          <button
                            onClick={() => startChatWithFriend(friend.id)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 bg-slate-900 hover:bg-teal-500 text-slate-400 hover:text-slate-950 rounded-lg transition duration-200 cursor-pointer"
                            title="Nhắn tin"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* 2. CHAT AREA WRAPPER */}
      <main className="flex-1 flex overflow-hidden h-full z-10">
        {selectedRoom ? (
          <div className="flex-1 flex overflow-hidden h-full">
            {/* Cột giữa: Cửa sổ Chat chính */}
            <div className="flex-1 flex flex-col h-full bg-slate-950/20 backdrop-blur-sm border-r border-slate-900/50">
              {/* Chat Header */}
              <div className="h-16 border-b border-slate-900/80 px-6 flex items-center justify-between bg-slate-950/40">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${selectedRoom.type === 'GROUP' ? 'bg-indigo-950 text-indigo-400' : 'bg-slate-800 text-teal-400'
                    }`}>
                    {selectedRoom.type === 'GROUP' ? <Users className="w-4.5 h-4.5" /> : <User className="w-4.5 h-4.5" />}
                  </div>
                  {/* Dot online ở header chat 1-1 */}
                  {selectedRoom.type === 'DIRECT' && (() => {
                    const partner = selectedRoom.members.find((m) => m.user.id !== currentUser?.id)?.user
                    const isOnline = partner && onlineUserIds.includes(partner.id)
                    return isOnline ? (
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border border-slate-950 rounded-full" />
                    ) : null
                  })()}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-100">{getRoomDisplayName(selectedRoom)}</h2>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {selectedRoom.type === 'GROUP' ? (
                      <p className="text-[10px] text-slate-500">
                        {selectedRoom.members.length} thành viên
                      </p>
                    ) : (() => {
                      const partner = selectedRoom.members.find((m) => m.user.id !== currentUser?.id)?.user
                      const isOnline = partner && onlineUserIds.includes(partner.id)
                      return (
                        <span className="text-[10px] font-semibold flex items-center gap-1">
                          {isOnline ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span className="text-emerald-400 font-medium">Đang hoạt động</span>
                            </>
                          ) : (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                              <span className="text-slate-500 font-medium">Ngoại tuyến</span>
                            </>
                          )}
                        </span>
                      )
                    })()}
                  </div>
                </div>
              </div>

              {/* Nút bật/tắt Sidebar thông tin */}
              <button
                onClick={() => setIsInfoOpen(!isInfoOpen)}
                className={`p-2 rounded-xl transition cursor-pointer ${
                  isInfoOpen ? 'bg-slate-800 text-teal-400' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
                title="Thông tin hội thoại"
              >
                <Info className="w-5 h-5" />
              </button>
            </div>

            {/* Messages Screen */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2">
                  <MessageSquare className="w-10 h-10 text-slate-800" />
                  <p className="text-xs">Bắt đầu gửi tin nhắn tại đây.</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.senderId === currentUser?.id
                  const time = new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })

                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-3 max-w-[70%] ${isMe ? 'ml-auto flex-row-reverse' : ''}`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-semibold uppercase ${isMe ? 'bg-teal-600' : 'bg-slate-800'
                        }`}>
                        {msg.sender.avatarUrl ? (
                          <img src={msg.sender.avatarUrl} alt="Avatar" className="w-full h-full object-cover rounded-lg" />
                        ) : (
                          msg.sender.username?.[0] || '?'
                        )}
                      </div>

                      <div>
                        {!isMe && (
                          <span className="text-[10px] font-medium text-slate-500 ml-1.5 mb-1 block">
                            {msg.sender.username}
                          </span>
                        )}
                        <div
                          className={`p-3 px-4 rounded-2xl shadow-sm text-sm break-words whitespace-pre-wrap leading-relaxed ${msg.fileUrl
                              ? 'bg-transparent border border-transparent p-0 shadow-none'
                              : isMe
                                ? 'bg-teal-500/10 border border-teal-500/20 text-teal-200 rounded-tr-none'
                                : 'bg-slate-900 border border-slate-800 text-slate-300 rounded-tl-none'
                            }`}
                        >
                          {msg.fileUrl ? (
                            msg.fileType === 'image' ? (
                              <div className="space-y-1.5">
                                {msg.content && msg.content !== msg.fileName && (
                                  <p className={`p-3 px-4 rounded-2xl text-sm ${isMe ? 'bg-teal-500/10 border border-teal-500/20 text-teal-200 rounded-tr-none' : 'bg-slate-900 border border-slate-800 text-slate-300 rounded-tl-none'
                                    }`}>{msg.content}</p>
                                )}
                                <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="block max-w-xs overflow-hidden rounded-xl border border-slate-800 hover:opacity-90 transition">
                                  <img src={msg.fileUrl} alt={msg.fileName || 'Hình ảnh'} className="w-full h-auto max-h-60 object-cover" />
                                </a>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                {msg.content && msg.content !== msg.fileName && (
                                  <p className={`p-3 px-4 rounded-2xl text-sm mb-1.5 ${isMe ? 'bg-teal-500/10 border border-teal-500/20 text-teal-200 rounded-tr-none' : 'bg-slate-900 border border-slate-800 text-slate-300 rounded-tl-none'
                                    }`}>{msg.content}</p>
                                )}
                                <a
                                  href={`${msg.fileUrl}?download=${encodeURIComponent(msg.fileName || '')}`}
                                  download={msg.fileName || ''}
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-850 hover:border-slate-700/80 rounded-2xl transition text-xs font-semibold text-teal-400 group max-w-sm"
                                >
                                  <div className="p-2 bg-slate-950 text-slate-400 rounded-xl group-hover:text-teal-400 transition">
                                    <File className="w-5 h-5" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-slate-200 truncate font-semibold">{msg.fileName}</p>
                                    <span className="text-[9px] text-slate-500 mt-0.5 block uppercase tracking-wider">Tệp đính kèm</span>
                                  </div>
                                  <div className="p-2 text-slate-500 group-hover:text-teal-400 transition">
                                    <Download className="w-4 h-4" />
                                  </div>
                                </a>
                              </div>
                            )
                          ) : (
                            msg.content
                          )}
                        </div>
                        <span className={`text-[9px] text-slate-200 mt-1 block px-1.5 ${isMe ? 'text-right' : ''}`}>
                          {time}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <div className="p-4 border-t border-slate-900 bg-slate-950/40">
              <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                {/* File Input Ẩn */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />

                {/* Nút đính kèm */}
                <button
                  type="button"
                  disabled={fileUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 bg-slate-900 hover:bg-slate-800 text-teal-400 hover:text-teal-300 border border-slate-800 hover:border-slate-700 rounded-2xl transition flex-shrink-0 cursor-pointer disabled:opacity-40"
                  title="Đính kèm tệp tin / hình ảnh (tối đa 25MB)"
                >
                  {fileUploading ? (
                    <Loader2 className="w-4.5 h-4.5 animate-spin" />
                  ) : (
                    <Paperclip className="w-4.5 h-4.5" />
                  )}
                </button>

                <input
                  type="text"
                  placeholder={fileUploading ? "Đang tải tệp đính kèm lên..." : "Viết tin nhắn dịu mắt tại đây..."}
                  value={inputText}
                  disabled={fileUploading}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 bg-slate-900/60 border border-slate-800 hover:border-slate-700/80 focus:border-teal-500/70 focus:ring-1 focus:ring-teal-500/30 rounded-2xl p-3 px-4 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || sending || fileUploading}
                  className="p-3 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-2xl transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex-shrink-0"
                >
                  <Send className="w-4.5 h-4.5" />
                </button>
              </form>
            </div>

            </div>

            {/* Cột phải: Sidebar thông tin nhóm (Messenger style) */}
            {isInfoOpen && (
              <aside className="w-80 border-l border-slate-900 bg-slate-950/60 backdrop-blur-xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-250">
                {/* Header sidebar thông tin */}
                <div className="p-4 border-b border-slate-900 flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-400 uppercase tracking-wider">Thông tin hội thoại</span>
                  <button
                    onClick={() => setIsInfoOpen(false)}
                    className="p-1.5 hover:bg-slate-900 rounded-lg text-slate-500 hover:text-slate-300 transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                  {/* Avatar và tên */}
                  <div className="flex flex-col items-center text-center py-4 border-b border-slate-900/50">
                    <div className={`w-20 h-20 rounded-2xl flex items-center justify-center font-bold text-2xl shadow-inner mb-3 ${
                      selectedRoom.type === 'GROUP' ? 'bg-indigo-950 text-indigo-400' : 'bg-slate-800 text-teal-400'
                    }`}>
                      {selectedRoom.type === 'GROUP' ? (
                        <Users className="w-10 h-10" />
                      ) : (() => {
                        const partner = selectedRoom.members.find((m) => m.user.id !== currentUser?.id)?.user
                        return partner?.avatarUrl ? (
                          <img src={partner.avatarUrl} alt="Avatar" className="w-full h-full object-cover rounded-2xl" />
                        ) : (
                          getRoomDisplayName(selectedRoom)[0].toUpperCase()
                        )
                      })()}
                    </div>
                    <h3 className="font-bold text-slate-100 text-sm truncate max-w-full px-2">{getRoomDisplayName(selectedRoom)}</h3>
                    <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-semibold">
                      {selectedRoom.type === 'GROUP' ? 'Nhóm chat' : 'Trực tiếp'}
                    </p>
                  </div>

                  {/* Danh sách thành viên (chỉ nhóm chat) */}
                  {selectedRoom.type === 'GROUP' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Thành viên ({selectedRoom.members.length})</span>
                        <button
                          onClick={() => {
                            setAddMemberSelectedIds([])
                            setIsAddMemberModalOpen(true)
                          }}
                          className="text-[10px] font-bold text-teal-400 hover:text-teal-300 transition flex items-center gap-1 cursor-pointer"
                        >
                          <PlusCircle className="w-3.5 h-3.5" /> Thêm
                        </button>
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto bg-slate-900/10 border border-slate-900/80 rounded-xl p-2">
                        {selectedRoom.members.map((member) => {
                          const isMemberOnline = onlineUserIds.includes(member.user.id)
                          return (
                            <div key={member.user.id} className="flex items-center gap-2.5 p-1">
                              <div className="relative flex-shrink-0">
                                <div className="w-7.5 h-7.5 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-semibold text-teal-400 uppercase shadow-inner">
                                  {member.user.avatarUrl ? (
                                    <img src={member.user.avatarUrl} alt="Avatar" className="w-full h-full object-cover rounded-lg" />
                                  ) : (
                                    member.user.username?.[0] || '?'
                                  )}
                                </div>
                                {isMemberOnline && (
                                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border border-slate-950 rounded-full" />
                                )}
                              </div>
                              <span className="text-xs font-semibold text-slate-300 truncate">
                                {member.user.username}
                                {member.user.id === currentUser?.id && ' (Bạn)'}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Hình ảnh đã gửi */}
                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Hình ảnh đã chia sẻ</span>
                    {(() => {
                      const sharedImages = messages.filter((m) => m.fileUrl && m.fileType === 'image')
                      if (sharedImages.length === 0) {
                        return <p className="text-[11px] text-slate-600 italic pl-1">Chưa có hình ảnh nào được chia sẻ.</p>
                      }
                      return (
                        <div className="grid grid-cols-3 gap-2 bg-slate-900/10 border border-slate-900/80 rounded-xl p-2 max-h-48 overflow-y-auto">
                          {sharedImages.map((img) => (
                            <a
                              key={img.id}
                              href={img.fileUrl!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="aspect-square rounded-lg overflow-hidden border border-slate-850 hover:opacity-80 transition block"
                              title={img.fileName || 'Ảnh'}
                            >
                              <img src={img.fileUrl!} alt="Shared Media" className="w-full h-full object-cover" />
                            </a>
                          ))}
                        </div>
                      )
                    })()}
                  </div>

                  {/* File đã gửi */}
                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tài liệu đã chia sẻ</span>
                    {(() => {
                      const sharedFiles = messages.filter((m) => m.fileUrl && m.fileType === 'file')
                      if (sharedFiles.length === 0) {
                        return <p className="text-[11px] text-slate-600 italic pl-1">Chưa có tài liệu nào được chia sẻ.</p>
                      }
                      return (
                        <div className="space-y-2 bg-slate-900/10 border border-slate-900/80 rounded-xl p-2 max-h-48 overflow-y-auto">
                          {sharedFiles.map((file) => (
                            <a
                              key={file.id}
                              href={`${file.fileUrl}?download=${encodeURIComponent(file.fileName || '')}`}
                              download={file.fileName || ''}
                              className="flex items-center justify-between p-2 hover:bg-slate-900/40 rounded-lg group transition text-left"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <FileText className="w-4 h-4 text-slate-500 group-hover:text-teal-400 transition flex-shrink-0" />
                                <span className="text-[11px] font-medium text-slate-300 truncate pr-2">{file.fileName}</span>
                              </div>
                              <Download className="w-3.5 h-3.5 text-slate-500 group-hover:text-teal-400 transition flex-shrink-0" />
                            </a>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </aside>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 space-y-4 bg-slate-950/20 backdrop-blur-sm">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-700 shadow-md">
              <MessageSquare className="w-8 h-8" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-300">Chào mừng đến với AetherChat</h3>
              <p className="text-xs text-slate-600 mt-1.5">
                Hãy kết bạn và chọn một cuộc hội thoại từ sidebar để bắt đầu nhắn tin.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* 3. CREATION MODAL (RÀNG BUỘC: CHỈ HIỂN THỊ DANH SÁCH BẠN BÈ) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => {
                setIsModalOpen(false)
                setSelectedMembers([])
                setGroupName('')
              }}
              className="absolute top-4 right-4 p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-300 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold text-slate-100 mb-6 flex items-center gap-2">
              Bắt đầu cuộc trò chuyện mới <Sparkles className="w-4 h-4 text-teal-400" />
            </h2>

            <div className="grid grid-cols-2 bg-slate-950 p-1 rounded-xl mb-6 border border-slate-800/80 text-xs">
              <button
                type="button"
                onClick={() => {
                  setModalType('DIRECT')
                  setSelectedMembers([])
                }}
                className={`py-2 font-semibold rounded-lg transition ${modalType === 'DIRECT' ? 'bg-slate-800 text-teal-400' : 'text-slate-400'
                  }`}
              >
                Nhắn tin riêng (1-1)
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalType('GROUP')
                  setSelectedMembers([])
                }}
                className={`py-2 font-semibold rounded-lg transition ${modalType === 'GROUP' ? 'bg-slate-800 text-teal-400' : 'text-slate-400'
                  }`}
              >
                Tạo nhóm chat
              </button>
            </div>

            {modalType === 'GROUP' && (
              <div className="mb-5 space-y-2">
                <label className="text-xs font-semibold text-slate-400 tracking-wide uppercase">Tên phòng nhóm</label>
                <input
                  type="text"
                  placeholder="Nhóm học tập, Dự án mới..."
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500/70 focus:ring-1 focus:ring-teal-500/30 rounded-xl p-3 text-sm text-slate-100 focus:outline-none transition"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 tracking-wide uppercase">
                {modalType === 'DIRECT' ? 'Chọn bạn bè nhắn tin' : 'Chọn thành viên bạn bè'}
              </label>
              <div className="max-h-48 overflow-y-auto border border-slate-800/50 rounded-xl bg-slate-950/40 p-2 space-y-1">
                {friends.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-600">
                    Chưa có bạn bè nào.<br />Vui lòng kết bạn trước khi bắt đầu chat!
                  </div>
                ) : (
                  friends.map((friend) => {
                    const isChecked = selectedMembers.includes(friend.id)
                    return (
                      <button
                        key={friend.id}
                        onClick={() => toggleMemberSelection(friend.id)}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl transition ${isChecked ? 'bg-teal-500/10 text-teal-400' : 'hover:bg-slate-800/50 text-slate-400'
                          }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7.5 h-7.5 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-xs uppercase">
                            {friend.avatarUrl ? (
                              <img src={friend.avatarUrl} alt="Avatar" className="w-full h-full object-cover rounded-lg" />
                            ) : (
                              friend.username?.[0] || friend.email[0]
                            )}
                          </div>
                          <span className="text-sm font-medium">{friend.username}</span>
                        </div>
                        {isChecked && <Check className="w-4 h-4 text-teal-400" />}
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            <button
              onClick={handleCreateRoom}
              disabled={
                creating ||
                selectedMembers.length === 0 ||
                (modalType === 'GROUP' && !groupName.trim())
              }
              className="w-full mt-6 py-3 bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang thiết lập...
                </>
              ) : (
                'Bắt đầu Trò chuyện'
              )}
            </button>
          </div>
        </div>
      )}
      {/* MODAL THÊM THÀNH VIÊN VÀO NHÓM */}
      {isAddMemberModalOpen && selectedRoom && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => {
                setIsAddMemberModalOpen(false)
                setAddMemberSelectedIds([])
              }}
              className="absolute top-4 right-4 p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-300 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-sm font-bold text-slate-100 mb-6 flex items-center gap-2">
              Thêm thành viên mới <Sparkles className="w-4 h-4 text-teal-400" />
            </h2>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Chọn bạn bè chưa tham gia nhóm
              </label>
              <div className="max-h-48 overflow-y-auto border border-slate-800/50 rounded-xl bg-slate-950/40 p-2 space-y-1">
                {(() => {
                  const memberIds = selectedRoom.members.map((m) => m.user.id)
                  const eligibleFriends = friends.filter((f) => !memberIds.includes(f.id))

                  if (eligibleFriends.length === 0) {
                    return (
                      <div className="text-center py-6 text-xs text-slate-600">
                        Tất cả bạn bè đã tham gia nhóm này!
                      </div>
                    )
                  }

                  return eligibleFriends.map((friend) => {
                    const isChecked = addMemberSelectedIds.includes(friend.id)
                    return (
                      <button
                        key={friend.id}
                        onClick={() => {
                          setAddMemberSelectedIds((prev) =>
                            prev.includes(friend.id) ? prev.filter((id) => id !== friend.id) : [...prev, friend.id]
                          )
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-xl transition ${
                          isChecked ? 'bg-teal-500/10 text-teal-400' : 'hover:bg-slate-800/50 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-xs uppercase">
                            {friend.avatarUrl ? (
                              <img src={friend.avatarUrl} alt="Avatar" className="w-full h-full object-cover rounded-lg" />
                            ) : (
                              friend.username?.[0] || friend.email[0]
                            )}
                          </div>
                          <span className="text-xs font-semibold">{friend.username}</span>
                        </div>
                        {isChecked && <Check className="w-3.5 h-3.5" />}
                      </button>
                    )
                  })
                })()}
              </div>
            </div>

            <button
              onClick={handleAddMembers}
              disabled={addingMembers || addMemberSelectedIds.length === 0}
              className="w-full mt-6 py-2.5 bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-2 text-sm"
            >
              {addingMembers ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang thêm...
                </>
              ) : (
                'Xác nhận Thêm'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
