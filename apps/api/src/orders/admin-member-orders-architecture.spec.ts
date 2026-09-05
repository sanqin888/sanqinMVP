import { readFileSync } from 'fs';
import { join } from 'path';

const source = (relativePath: string) =>
  readFileSync(join(__dirname, relativePath), 'utf8');

describe('Phase 4 Slice 4C member Orders ownership boundary', () => {
  it('owns the admin member Orders transport inside Orders without an Admin -> Orders public edge', () => {
    const controller = source('./admin-member-orders.controller.ts');
    const adminController = source('../admin/members/admin-members.controller.ts');
    const adminService = source('../admin/members/admin-members.service.ts');

    expect(controller).toContain("@Controller('admin/members')");
    expect(controller).toContain("@Get(':userStableId/orders')");
    expect(controller).toContain("@Get(':userStableId/top-items')");
    expect(adminController).not.toContain("@Get(':userStableId/orders')");
    expect(adminController).not.toContain("@Get(':userStableId/top-items')");
    expect(adminService).not.toContain('listOrders(');
    expect(adminService).not.toContain('listTopPurchasedItems(');
    expect(adminService).not.toContain('this.prisma.orderItem.findMany');
    expect(adminService).not.toContain("from '../../orders/public-api'");
  });

  it('queries Orders by stable member identity and never resolves User persistence in the read model', () => {
    const service = source('./admin-member-orders-read.service.ts');

    expect(service).toContain('where: { userStableId }');
    expect(service).toContain('userStableId,');
    expect(service).not.toContain('prisma.user');
    expect(service).not.toContain('userId:');
  });
});
