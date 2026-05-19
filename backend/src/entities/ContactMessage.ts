import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * A single message submitted through the public contact form.
 * Indexed by createdAt for time-ordered listings (most-recent first).
 */
@Entity({ name: 'contact_messages' })
export class ContactMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @Column({ type: 'text' })
  subject!: string;

  @Column({ type: 'text' })
  message!: string;

  @Index()
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
