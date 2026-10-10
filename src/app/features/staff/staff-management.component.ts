import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { StaffService } from '../../core/services/staff.service';
import { AuthService } from '../../core/services/auth.service';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';
import { StaffMember, UserRole, ROLE_DEFINITIONS, RoleDefinition } from '../../core/models/staff.model';

@Component({
  selector: 'app-staff-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, StatCardComponent],
  templateUrl: './staff-management.component.html'
})
export class StaffManagementComponent {
  readonly staffService = inject(StaffService);
  readonly authService = inject(AuthService);
  private fb = inject(FormBuilder);

  isModalOpen = signal(false);
  editingMember = signal<StaffMember | null>(null);
  searchQuery = signal('');
  roleFilter = signal<string>('all');

  staffForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    role: ['waiter', [Validators.required]],
    phone: [''],
    notes: ['']
  });

  readonly availableRoles: RoleDefinition[] = Object.values(ROLE_DEFINITIONS);

  get filteredStaff(): StaffMember[] {
    let list = this.staffService.staff();
    const query = this.searchQuery().toLowerCase().trim();
    const filter = this.roleFilter();

    if (filter !== 'all') {
      list = list.filter(m => m.role === filter);
    }

    if (query) {
      list = list.filter(m =>
        m.name.toLowerCase().includes(query) ||
        m.email.toLowerCase().includes(query) ||
        (m.phone && m.phone.includes(query)) ||
        (m.notes && m.notes.toLowerCase().includes(query))
      );
    }

    return list;
  }

  getRoleDef(role: UserRole): RoleDefinition {
    return ROLE_DEFINITIONS[role] || ROLE_DEFINITIONS.waiter;
  }

  openAddModal(): void {
    this.editingMember.set(null);
    this.staffForm.reset({
      name: '',
      email: '',
      role: 'waiter',
      phone: '',
      notes: ''
    });
    this.isModalOpen.set(true);
  }

  openEditModal(member: StaffMember): void {
    this.editingMember.set(member);
    this.staffForm.patchValue({
      name: member.name,
      email: member.email,
      role: member.role,
      phone: member.phone || '',
      notes: member.notes || ''
    });
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.editingMember.set(null);
  }

  async onSubmit(): Promise<void> {
    if (this.staffForm.invalid) {
      this.staffForm.markAllAsTouched();
      return;
    }

    const val = this.staffForm.value;
    const current = this.editingMember();

    if (current) {
      await this.staffService.updateStaffMember(current.id, {
        name: val.name.trim(),
        email: val.email.trim().toLowerCase(),
        role: val.role,
        phone: val.phone?.trim() || undefined,
        notes: val.notes?.trim() || undefined
      });
    } else {
      await this.staffService.addStaffMember({
        name: val.name,
        email: val.email,
        role: val.role,
        phone: val.phone,
        notes: val.notes
      });
    }

    this.closeModal();
  }

  async toggleStatus(member: StaffMember): Promise<void> {
    await this.staffService.toggleStatus(member);
  }

  async deleteMember(member: StaffMember): Promise<void> {
    if (confirm(`Czy na pewno chcesz usunąć pracownika: ${member.name}?`)) {
      await this.staffService.deleteStaffMember(member.id, member.name);
    }
  }

  formatDate(isoDate: string): string {
    if (!isoDate) return '-';
    const d = new Date(isoDate);
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
