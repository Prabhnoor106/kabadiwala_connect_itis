/**
 * Admin Model — thin Prisma wrapper over the `admins` table.
 */
const prisma = require('../config/db');

/** Fields safe to return to a client — never the password hash. */
const PUBLIC_FIELDS = {
  id: true,
  email: true,
  full_name: true,
  created_at: true,
};

const Admin = {
  /**
   * Find an admin by email, including the password hash (login only).
   */
  async findByEmailWithSecret(email) {
    return prisma.admins.findUnique({
      where: { email: String(email).toLowerCase().trim() },
    });
  },

  /**
   * Find an admin by ID without secrets.
   */
  async findById(id) {
    return prisma.admins.findUnique({
      where: { id },
      select: PUBLIC_FIELDS,
    });
  },

  /**
   * Create an admin. `password_hash` must already be hashed.
   */
  async create({ email, password_hash, full_name }) {
    return prisma.admins.create({
      data: {
        email: String(email).toLowerCase().trim(),
        password_hash,
        full_name,
      },
      select: PUBLIC_FIELDS,
    });
  },

  /**
   * Count admins — used to allow bootstrapping the very first admin.
   */
  async count() {
    return prisma.admins.count();
  },

  /**
   * List all admins (admin-only view).
   */
  async findMany({ skip = 0, take = 20 } = {}) {
    const [data, total] = await Promise.all([
      prisma.admins.findMany({
        select: PUBLIC_FIELDS,
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      prisma.admins.count(),
    ]);
    return { data, total };
  },

  PUBLIC_FIELDS,
};

module.exports = Admin;
