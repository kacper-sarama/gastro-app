import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { StaffService } from '../../core/services/staff.service';
import { AuthService } from '../../core/services/auth.service';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';
import { StaffMember, UserRole, ROLE_DEFINITIONS, RoleDefinition } from '../../core/models/staff.model';
import { AddEditStaffModalComponent } from './add-edit-staff-modal.component';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';

@Component({
  selector: 'app-staff-management',
  standalone: true,
  imports: [CommonModule, StatCardComponent, MatDialogModule, MatTooltipModule],
  templateUrl: './staff-management.component.html'
})
export class StaffManagementComponent {
  readonly staffService = inject(StaffService);
  readonly authService = inject(AuthService);
  private dialog = inject(MatDialog);
  private confirmDialogService = inject(ConfirmDialogService);

  searchQuery = signal('');
  roleFilter = signal<string>('all');

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
    this.dialog.open(AddEditStaffModalComponent, {
      data: { member: null },
      panelClass: 'gastro-dialog-panel'
    });
  }

  openEditModal(member: StaffMember): void {
    this.dialog.open(AddEditStaffModalComponent, {
      data: { member },
      panelClass: 'gastro-dialog-panel'
    });
  }

  async toggleStatus(member: StaffMember): Promise<void> {
    await this.staffService.toggleStatus(member);
  }

  async deleteMember(member: StaffMember): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: 'Usunąć pracownika?',
      message: `Czy na pewno chcesz usunąć pracownika "${member.name}"?`,
      confirmText: 'Usuń',
      isDestructive: true
    });

    if (confirmed) {
      await this.staffService.deleteStaffMember(member.id, member.name);
    }
  }

  formatDate(isoDate: string): string {
    if (!isoDate) return '-';
    const d = new Date(isoDate);
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
