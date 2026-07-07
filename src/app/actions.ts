'use server'

import prisma from '@/lib/prisma'
import { RoomType, FriendshipStatus } from '@prisma/client'

// Đồng bộ User từ Supabase Auth sang Prisma Database
export async function syncUser(id: string, email: string, username?: string, avatarUrl?: string) {
  try {
    const user = await prisma.user.upsert({
      where: { id },
      update: {
        email,
        username: username || email.split('@')[0],
        avatarUrl,
      },
      create: {
        id,
        email,
        username: username || email.split('@')[0],
        avatarUrl,
      },
    })
    return { success: true, user }
  } catch (error: any) {
    console.error('Error syncing user:', error)
    return { success: false, error: error.message }
  }
}

// Lấy danh sách tất cả các User chưa có mối quan hệ bạn bè nào để gửi lời mời
export async function getAllUsers(currentUserId: string) {
  try {
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { senderId: currentUserId },
          { receiverId: currentUserId }
        ]
      }
    })

    const relatedUserIds = friendships.flatMap((f) => [f.senderId, f.receiverId])
    const excludeIds = Array.from(new Set([currentUserId, ...relatedUserIds]))

    const users = await prisma.user.findMany({
      where: {
        id: { notIn: excludeIds },
      },
      orderBy: {
        username: 'asc',
      },
    })
    return { success: true, users }
  } catch (error: any) {
    console.error('Error getting users:', error)
    return { success: false, error: error.message }
  }
}

// Lấy danh sách Bạn bè đã kết nối (ACCEPTED)
export async function getFriends(userId: string) {
  try {
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { senderId: userId, status: FriendshipStatus.ACCEPTED },
          { receiverId: userId, status: FriendshipStatus.ACCEPTED }
        ]
      },
      include: {
        sender: true,
        receiver: true
      }
    })

    const friends = friendships.map((f) => 
      f.senderId === userId ? f.receiver : f.sender
    )

    return { success: true, friends }
  } catch (error: any) {
    console.error('Error getting friends:', error)
    return { success: false, error: error.message }
  }
}

// Lấy danh sách lời mời kết bạn đang chờ (Pending)
export async function getPendingRequests(userId: string) {
  try {
    const incoming = await prisma.friendship.findMany({
      where: {
        receiverId: userId,
        status: FriendshipStatus.PENDING
      },
      include: {
        sender: true
      }
    })

    const outgoing = await prisma.friendship.findMany({
      where: {
        senderId: userId,
        status: FriendshipStatus.PENDING
      },
      include: {
        receiver: true
      }
    })

    return { success: true, incoming, outgoing }
  } catch (error: any) {
    console.error('Error getting pending requests:', error)
    return { success: false, error: error.message }
  }
}

// Gửi yêu cầu kết bạn
export async function sendFriendRequest(senderId: string, receiverEmailOrUsername: string) {
  try {
    // Tìm người dùng được yêu cầu kết bạn
    const receiver = await prisma.user.findFirst({
      where: {
        OR: [
          { email: receiverEmailOrUsername },
          { username: receiverEmailOrUsername }
        ]
      }
    })

    if (!receiver) {
      return { success: false, error: 'Không tìm thấy người dùng với email hoặc username này!' }
    }

    if (receiver.id === senderId) {
      return { success: false, error: 'Bạn không thể gửi lời mời kết bạn cho chính mình!' }
    }

    // Kiểm tra xem đã có mối quan hệ bạn bè nào tồn tại chưa
    const existingFriendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId, receiverId: receiver.id },
          { senderId: receiver.id, receiverId: senderId }
        ]
      }
    })

    if (existingFriendship) {
      if (existingFriendship.status === FriendshipStatus.ACCEPTED) {
        return { success: false, error: 'Hai bạn đã là bạn bè của nhau rồi!' }
      }
      if (existingFriendship.status === FriendshipStatus.PENDING) {
        return { success: false, error: 'Yêu cầu kết bạn đang trong trạng thái chờ phản hồi!' }
      }
      
      // Nếu đã từ chối trước đó, cập nhật lại thành PENDING
      const updated = await prisma.friendship.update({
        where: { id: existingFriendship.id },
        data: {
          senderId,
          receiverId: receiver.id,
          status: FriendshipStatus.PENDING
        }
      })
      return { success: true, friendship: updated }
    }

    // Tạo mới lời mời kết bạn
    const friendship = await prisma.friendship.create({
      data: {
        senderId,
        receiverId: receiver.id,
        status: FriendshipStatus.PENDING
      }
    })

    return { success: true, friendship }
  } catch (error: any) {
    console.error('Error sending friend request:', error)
    return { success: false, error: error.message }
  }
}

// Chấp nhận hoặc Từ chối yêu cầu kết bạn
export async function respondToFriendRequest(friendshipId: string, status: 'ACCEPTED' | 'DECLINED') {
  try {
    const updated = await prisma.friendship.update({
      where: { id: friendshipId },
      data: {
        status: status === 'ACCEPTED' ? FriendshipStatus.ACCEPTED : FriendshipStatus.DECLINED
      }
    })
    return { success: true, friendship: updated }
  } catch (error: any) {
    console.error('Error responding to friend request:', error)
    return { success: false, error: error.message }
  }
}

// Lấy danh sách phòng chat mà user hiện tại tham gia
export async function getRooms(userId: string) {
  try {
    const memberships = await prisma.roomMember.findMany({
      where: { userId },
      include: {
        room: {
          include: {
            members: {
              include: {
                user: true,
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: {
        room: {
          updatedAt: 'desc',
        },
      },
    })
    return { success: true, rooms: memberships.map((m) => m.room) }
  } catch (error: any) {
    console.error('Error getting rooms:', error)
    return { success: false, error: error.message }
  }
}

// Tạo phòng chat (Direct 1-1 hoặc Group) - Ràng buộc: Direct chat chỉ cho phép tạo giữa các Bạn bè
export async function createRoom(
  creatorId: string,
  targetUserIds: string[], // Không bao gồm creatorId
  name?: string,
  type: 'DIRECT' | 'GROUP' = 'DIRECT'
) {
  try {
    const allMemberIds = Array.from(new Set([creatorId, ...targetUserIds]))

    // Nếu là Chat Direct (1-1), kiểm tra xem đã tồn tại phòng direct giữa 2 người chưa
    if (type === 'DIRECT' && allMemberIds.length === 2) {
      const existingRooms = await prisma.room.findMany({
        where: {
          type: RoomType.DIRECT,
          members: {
            every: {
              userId: { in: allMemberIds },
            },
          },
        },
        include: {
          members: true,
        },
      })

      // Lọc chính xác phòng có đúng 2 thành viên này
      const exactRoom = existingRooms.find((r) => r.members.length === 2)
      if (exactRoom) {
        return { success: true, roomId: exactRoom.id }
      }
    }

    // Tạo phòng mới và thêm các thành viên
    const room = await prisma.room.create({
      data: {
        name: type === 'GROUP' ? name || 'Nhóm mới' : null,
        type: type === 'DIRECT' ? RoomType.DIRECT : RoomType.GROUP,
        members: {
          create: allMemberIds.map((userId) => ({
            userId,
          })),
        },
      },
    })

    return { success: true, roomId: room.id }
  } catch (error: any) {
    console.error('Error creating room:', error)
    return { success: false, error: error.message }
  }
}

// Lấy lịch sử tin nhắn của một phòng chat
export async function getMessages(roomId: string) {
  try {
    const messages = await prisma.message.findMany({
      where: { roomId },
      include: {
        sender: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })
    return { success: true, messages }
  } catch (error: any) {
    console.error('Error getting messages:', error)
    return { success: false, error: error.message }
  }
}

// Gửi tin nhắn (Hỗ trợ tệp đính kèm)
export async function sendMessage(
  roomId: string,
  senderId: string,
  content: string,
  fileUrl?: string,
  fileName?: string,
  fileType?: string
) {
  try {
    const message = await prisma.message.create({
      data: {
        roomId,
        senderId,
        content,
        fileUrl,
        fileName,
        fileType,
      },
      include: {
        sender: true,
      },
    })

    // Cập nhật updatedAt của Room để phòng chat được đẩy lên đầu danh sách
    await prisma.room.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    })

    return { success: true, message }
  } catch (error: any) {
    console.error('Error sending message:', error)
    return { success: false, error: error.message }
  }
}

// Thêm các thành viên bạn bè vào phòng chat nhóm
export async function addMembersToRoom(roomId: string, userIds: string[]) {
  try {
    const existingMembers = await prisma.roomMember.findMany({
      where: { roomId },
      select: { userId: true }
    })
    const existingUserIds = existingMembers.map((m) => m.userId)
    const newUserIds = userIds.filter((id) => !existingUserIds.includes(id))

    if (newUserIds.length === 0) {
      return { success: true }
    }

    await prisma.roomMember.createMany({
      data: newUserIds.map((userId) => ({
        roomId,
        userId
      }))
    })

    // Cập nhật updatedAt của Room
    await prisma.room.update({
      where: { id: roomId },
      data: { updatedAt: new Date() }
    })

    return { success: true }
  } catch (error: any) {
    console.error('Error adding members to room:', error)
    return { success: false, error: error.message }
  }
}
