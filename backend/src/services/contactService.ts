import { ILike, Repository } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { ContactMessage } from '../entities/ContactMessage';
import type { ContactPayload, ListQuery } from '../validators/contactSchema';

export interface PaginatedResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Escape LIKE/ILIKE metacharacters in user-supplied search strings so that
 * a literal "%" or "_" matches a literal "%" or "_" instead of acting as
 * wildcards. The backslash itself must be escaped first.
 */
function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Domain logic for contact messages. Keeps controllers thin and
 * lets us swap the persistence layer later without rewriting routes.
 */
export class ContactService {
  private get repo(): Repository<ContactMessage> {
    return AppDataSource.getRepository(ContactMessage);
  }

  async create(payload: ContactPayload): Promise<ContactMessage> {
    const entity = this.repo.create(payload);
    return this.repo.save(entity);
  }

  /**
   * Paginated list, newest-first. When `q` is provided, matches it
   * case-insensitively against name, email, and message via ILIKE.
   */
  async list(query: ListQuery): Promise<PaginatedResult<ContactMessage>> {
    const { page, pageSize, q } = query;
    const safeQ = q ? escapeLike(q) : undefined;
    const where = safeQ
      ? [
          { name: ILike(`%${safeQ}%`) },
          { email: ILike(`%${safeQ}%`) },
          { message: ILike(`%${safeQ}%`) },
        ]
      : undefined;

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      data,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async findById(id: string): Promise<ContactMessage | null> {
    return this.repo.findOne({ where: { id } });
  }
}

export const contactService = new ContactService();
