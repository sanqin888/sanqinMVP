//apps/api/src/admin/pos-devices/admin-pos-devices.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePosDeviceDto } from './dto/create-pos-device.dto';
import { createHash, randomBytes } from 'crypto';

@Injectable()
export class AdminPosDevicesService {
  constructor(private readonly prisma: PrismaService) {}

  // 生成 8 位大写绑定码 (如: A1B2-C3D4 格式或纯字符)
  private generateEnrollmentCode(): string {
    // 生成 4 字节 hex (8 字符)
    return randomBytes(4).toString('hex').toUpperCase();
  }

  // 与 PosDeviceService 中的哈希算法保持一致
  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  async create(dto: CreatePosDeviceDto) {
    const enrollmentCode = this.generateEnrollmentCode();
    const enrollmentKeyHash = this.hashKey(enrollmentCode);

    // deviceKeyHash 是必填的，但创建时设备还未绑定，给一个初始占位符
    // 当 POS 端调用 claim 接口时，这个值会被更新为真实的通信密钥哈希
    const initialDeviceKeyHash = this.hashKey(
      'PENDING_CLAIM_' + randomBytes(8).toString('hex'),
    );

    const device = await this.prisma.posDevice.create({
      data: {
        name: dto.name,
        storeId: dto.storeId ?? '00000000-0000-0000-0000-000000000000', // 默认 UUID，根据实际业务调整
        enrollmentKeyHash,
        deviceKeyHash: initialDeviceKeyHash,
        status: 'ACTIVE',
      },
    });

    // 返回给前端展示，注意：这是唯一一次能看到 enrollmentCode 的机会
    return {
      ...device,
      enrollmentCode,
    };
  }

  async findAll() {
    return this.prisma.posDevice.findMany({
      orderBy: { enrolledAt: 'desc' },
    });
  }

  // 如果忘记了绑定码，可以重置
  async resetEnrollmentCode(id: string) {
    const enrollmentCode = this.generateEnrollmentCode();
    const enrollmentKeyHash = this.hashKey(enrollmentCode);

    const device = await this.prisma.posDevice.update({
      where: { id },
      data: {
        enrollmentKeyHash,
        // 重置后设备状态通常设为 ACTIVE 以便重新绑定
        status: 'ACTIVE',
      },
    });

    return {
      ...device,
      enrollmentCode,
    };
  }

  async delete(id: string) {
    return this.prisma.posDevice.delete({
      where: { id },
    });
  }
}
