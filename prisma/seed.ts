import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Erstelle Admin User
  const hashedPassword = await bcrypt.hash("admin123", 10);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@worktime.local" },
    update: {},
    create: {
      email: "admin@worktime.local",
      password: hashedPassword,
      name: "Admin User",
      role: "ADMIN",
      settings: {
        create: {
          weeklyWorkHours: 40.0,
          overtimeNotification: true,
          language: "de",
          theme: "light",
        },
      },
    },
  });

  console.log({ adminUser });

  // Erstelle Test User
  const testUserPassword = await bcrypt.hash("test123", 10);

  const testUser = await prisma.user.upsert({
    where: { email: "test@worktime.local" },
    update: {},
    create: {
      email: "test@worktime.local",
      password: testUserPassword,
      name: "Test User",
      role: "USER",
      settings: {
        create: {
          weeklyWorkHours: 38.5,
          overtimeNotification: true,
          language: "de",
          theme: "light",
        },
      },
    },
  });

  console.log({ testUser });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
