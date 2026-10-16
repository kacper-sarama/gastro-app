import { Component, EventEmitter, Input, Output, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { StaffMember, UserRole, ROLE_DEFINITIONS, RoleDefinition } from '../../core/models/staff.model';
import { StaffService } from '../../core/services/staff.service';

export interface AddEditStaffModalData {
  member?: StaffMember | null;
}

@Component({
  selector: 'app-add-edit-staff-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './add-edit-staff-modal.component.html'
})
export class AddEditStaffModalComponent implements OnInit {
  private staffService = inject(StaffService);
  private fb = inject(FormBuilder);
  private dialogRef = inject<MatDialogRef<AddEditStaffModalComponent>>(MatDialogRef, { optional: true });
  private dialogData = inject<AddEditStaffModalData>(MAT_DIALOG_DATA, { optional: true });

  @Input() member: StaffMember | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  staffForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    role: ['waiter', [Validators.required]],
    phone: [''],
    notes: ['']
  });

  readonly availableRoles: RoleDefinition[] = Object.values(ROLE_DEFINITIONS);

  ngOnInit(): void {
    if (this.dialogData?.member !== undefined) {
      this.member = this.dialogData.member;
    }

    if (this.member) {
      this.staffForm.patchValue({
        name: this.member.name,
        email: this.member.email,
        role: this.member.role,
        phone: this.member.phone || '',
        notes: this.member.notes || ''
      });
    }
  }

  closeModal(): void {
    this.close.emit();
    this.dialogRef?.close();
  }

  async onSubmit(): Promise<void> {
    if (this.staffForm.invalid) {
      this.staffForm.markAllAsTouched();
      return;
    }

    const val = this.staffForm.value;
    const current = this.member;

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

    this.saved.emit();
    this.closeModal();
  }
}
