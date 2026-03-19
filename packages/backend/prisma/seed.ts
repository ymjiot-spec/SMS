import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // --- Companies ---
  const companies = await Promise.all([
    prisma.company.upsert({
      where: { code: 'star-service' },
      update: {},
      create: { name: 'スターサービス', code: 'star-service' },
    }),
    prisma.company.upsert({
      where: { code: 'dmobile' },
      update: {},
      create: { name: 'dmobile', code: 'dmobile' },
    }),
    prisma.company.upsert({
      where: { code: 'ewa' },
      update: {},
      create: { name: 'EWA', code: 'ewa' },
    }),
    prisma.company.upsert({
      where: { code: 'agency' },
      update: {},
      create: { name: '代理店向け', code: 'agency' },
    }),
    prisma.company.upsert({
      where: { code: 'common' },
      update: {},
      create: { name: '共通', code: 'common' },
    }),
  ]);

  const [starService, dmobile, ewa, agency, common] = companies;
  console.log(`  ✅ ${companies.length} companies created`);

  // --- Users ---
  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'operator@example.com' },
      update: {},
      create: {
        email: 'operator@example.com',
        name: 'Test Operator',
        phone: '09012345678',
        role: UserRole.OPERATOR,
        companyId: starService.id,
      },
    }),
    prisma.user.upsert({
      where: { email: 'supervisor@example.com' },
      update: {},
      create: {
        email: 'supervisor@example.com',
        name: 'Test Supervisor',
        phone: '09087654321',
        role: UserRole.SUPERVISOR,
        companyId: dmobile.id,
      },
    }),
    prisma.user.upsert({
      where: { email: 'admin@example.com' },
      update: {},
      create: {
        email: 'admin@example.com',
        name: 'Test System Admin',
        phone: '09011112222',
        role: UserRole.SYSTEM_ADMIN,
        companyId: common.id,
      },
    }),
  ]);

  const [_operator, supervisor, admin] = users;
  console.log(`  ✅ ${users.length} users created`);

  // --- Templates ---
  const templates = await Promise.all([
    prisma.template.create({
      data: {
        name: '本人確認SMS',
        body: '{{customer_name}}様\nご本人確認のため、以下のURLよりお手続きをお願いいたします。\n{{short_url}}\n\nスターサービス',
        companyId: starService.id,
        purpose: '本人確認',
        visibility: 'company',
        createdBy: supervisor.id,
      },
    }),
    prisma.template.create({
      data: {
        name: '支払案内SMS',
        body: '{{customer_name}}様\nお支払い期限が近づいております。詳細は以下をご確認ください。\n{{short_url}}\n\nお問い合わせ: {{support_email}}',
        companyId: dmobile.id,
        purpose: '支払案内',
        visibility: 'company',
        createdBy: supervisor.id,
      },
    }),
    prisma.template.create({
      data: {
        name: 'eSIM再申請案内SMS',
        body: '{{customer_name}}様\neSIMの再申請が可能です。以下のURLよりお手続きください。\n{{short_url}}\n\n担当: {{agent_name}}\nEWAサポート',
        companyId: ewa.id,
        purpose: 'eSIM再申請案内',
        visibility: 'company',
        createdBy: admin.id,
      },
    }),
    prisma.template.create({
      data: {
        name: '代理店向け連絡SMS',
        body: '{{customer_name}}様\nチケット#{{ticket_id}}について、ご連絡いたします。\n詳細は{{short_url}}をご確認ください。',
        companyId: agency.id,
        purpose: '一般連絡',
        visibility: 'company',
        createdBy: admin.id,
      },
    }),
    prisma.template.create({
      data: {
        name: '共通お知らせSMS',
        body: '{{customer_name}}様\n{{company_name}}よりお知らせです。\n{{short_url}}\n\n{{today}}',
        companyId: common.id,
        purpose: 'お知らせ',
        visibility: 'global',
        createdBy: admin.id,
      },
    }),
  ]);

  console.log(`  ✅ ${templates.length} templates created`);
  console.log('🌱 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
