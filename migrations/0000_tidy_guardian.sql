CREATE TYPE "public"."user_role" AS ENUM('admin', 'sales_manager', 'warehouse_manager', 'field_staff', 'hr_manager', 'accountant', 'kiosk');--> statement-breakpoint
CREATE TABLE "account_transfers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_account_id" varchar NOT NULL,
	"to_account_id" varchar NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"transfer_date" date NOT NULL,
	"reference" varchar(100),
	"notes" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar NOT NULL,
	"module" text DEFAULT 'inventory' NOT NULL,
	"document_type" text DEFAULT 'other' NOT NULL,
	"file_url" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"file_hash" text NOT NULL,
	"uploaded_by" varchar NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" varchar NOT NULL,
	"date" timestamp NOT NULL,
	"check_in" timestamp,
	"check_out" timestamp,
	"lunch_out" timestamp,
	"lunch_in" timestamp,
	"tea_out" timestamp,
	"tea_in" timestamp,
	"field_visit_out" timestamp,
	"field_visit_in" timestamp,
	"status" text DEFAULT 'present' NOT NULL,
	"selfie_url" text,
	"location" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"action" text NOT NULL,
	"module" text NOT NULL,
	"details" text,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"ip_address" text
);
--> statement-breakpoint
CREATE TABLE "balance_adjustments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cash_account_id" varchar NOT NULL,
	"adjustment_amount" numeric(12, 2) NOT NULL,
	"adjustment_date" date NOT NULL,
	"reason" text NOT NULL,
	"adjusted_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"default_margin_pct" numeric(5, 2) DEFAULT '10.00' NOT NULL,
	"gst_override_allowed" boolean DEFAULT false NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "brands_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "cash_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" text NOT NULL,
	"bank_name" varchar(100),
	"account_number" varchar(50),
	"ifsc_code" varchar(20),
	"opening_balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"opening_balance_date" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cash_accounts_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "credit_notes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credit_note_number" text NOT NULL,
	"invoice_id" varchar NOT NULL,
	"sales_return_id" varchar NOT NULL,
	"customer_id" varchar NOT NULL,
	"is_inter_state" boolean DEFAULT false NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"total_cgst" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_sgst" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_igst" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(12, 2) NOT NULL,
	"grand_total" numeric(12, 2) NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_notes_credit_note_number_unique" UNIQUE("credit_note_number")
);
--> statement-breakpoint
CREATE TABLE "custom_field_usage_stats" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"field_key" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" varchar NOT NULL,
	"customer_id" varchar NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_date" timestamp DEFAULT now() NOT NULL,
	"method" text DEFAULT 'bank_transfer' NOT NULL,
	"reference" text,
	"notes" text,
	"created_by" varchar,
	"cash_account_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"address" text,
	"gst_number" text,
	"contact_person" text,
	"customer_type" text DEFAULT 'end_user' NOT NULL,
	"payment_terms" text DEFAULT 'immediate' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_price_sheet_lots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" varchar NOT NULL,
	"grn_id" varchar,
	"grn_number" text,
	"lot_date" timestamp,
	"remaining_qty" numeric(12, 3) NOT NULL,
	"landed_cost" numeric(12, 2) NOT NULL,
	"floor_price" numeric(12, 2) NOT NULL,
	"proposed_price" numeric(12, 2)
);
--> statement-breakpoint
CREATE TABLE "daily_price_sheets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar NOT NULL,
	"sheet_date" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"proposed_price" numeric(12, 2),
	"blended_cost" numeric(12, 2),
	"global_floor_price" numeric(12, 2),
	"strict_floor_price" numeric(12, 2),
	"override_required" boolean DEFAULT false NOT NULL,
	"override_reason" text,
	"rejection_notes" text,
	"notes" text,
	"created_by" varchar NOT NULL,
	"confirmed_by" varchar,
	"rejected_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debug_payload_captures" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"event_type" text NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_challan_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challan_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"description" text,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2),
	"qty_ordered" numeric(12, 2),
	"qty_reserved" numeric(12, 2),
	"qty_to_dispatch" numeric(12, 2),
	"qty_dispatched" numeric(12, 2) DEFAULT '0'
);
--> statement-breakpoint
CREATE TABLE "delivery_challans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challan_number" text NOT NULL,
	"order_id" varchar NOT NULL,
	"customer_id" varchar,
	"source_type" text NOT NULL,
	"source_id" varchar NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"dispatch_date" timestamp,
	"delivery_date" timestamp,
	"dispatch_batch_id" varchar,
	"vehicle_number" text,
	"driver_name" text,
	"notes" text,
	"delivery_address" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"signed_copy_url" text,
	"signed_copy_uploaded_by" varchar,
	"signed_copy_uploaded_at" timestamp,
	"ready_for_signature_at" timestamp,
	"ready_for_signature_by" varchar,
	"dispatched_at" timestamp,
	"dispatched_by" varchar,
	"cancelled_at" timestamp,
	"cancelled_by" varchar,
	"cancellation_reason" text,
	"physical_challan_number" text,
	"vehicle_owner_name" text,
	"driver_phone" text,
	"do_issued_at" timestamp,
	"do_issued_by" varchar,
	"is_credit_override" boolean DEFAULT false NOT NULL,
	"credit_amount" numeric(12, 2),
	"credit_approved_by" varchar,
	"credit_approved_at" timestamp,
	"credit_reason" text,
	"printed_by" text,
	CONSTRAINT "delivery_challans_challan_number_unique" UNIQUE("challan_number")
);
--> statement-breakpoint
CREATE TABLE "doc_number_sequences" (
	"doc_type" text NOT NULL,
	"fy_str" text NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "doc_number_sequences_doc_type_fy_str_pk" PRIMARY KEY("doc_type","fy_str")
);
--> statement-breakpoint
CREATE TABLE "employee_advances" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" varchar NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"date_given" timestamp DEFAULT now() NOT NULL,
	"reason" text,
	"is_deducted" boolean DEFAULT false NOT NULL,
	"deducted_in_payroll_id" varchar,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_incentives" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" varchar NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"date_given" timestamp DEFAULT now() NOT NULL,
	"reason" text,
	"is_applied" boolean DEFAULT false NOT NULL,
	"applied_in_payroll_id" varchar,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"company" text,
	"department" text NOT NULL,
	"designation" text NOT NULL,
	"join_date" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"salary" numeric(12, 2),
	"qr_code" text
);
--> statement-breakpoint
CREATE TABLE "equity_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"account_type" text NOT NULL,
	"opening_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"opening_balance_date" date NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#64748b' NOT NULL,
	"icon" text DEFAULT 'Receipt' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "expense_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_date" date NOT NULL,
	"category_id" varchar NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_method" text NOT NULL,
	"description" varchar(500) NOT NULL,
	"vendor_name" varchar(200),
	"paid_by_user_id" varchar NOT NULL,
	"linked_entity_type" text,
	"linked_entity_id" varchar,
	"notes" text,
	"cash_account_id" varchar NOT NULL,
	"created_by_user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_staff_activities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" varchar NOT NULL,
	"activity_type" text NOT NULL,
	"description" text,
	"location" text,
	"date" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fixed_assets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"purchase_date" date NOT NULL,
	"purchase_value" numeric(14, 2) NOT NULL,
	"salvage_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"useful_life_years" integer NOT NULL,
	"depreciation_method" text DEFAULT 'slm' NOT NULL,
	"accumulated_dep_override" numeric(14, 2),
	"accumulated_dep_override_date" date,
	"accumulated_dep_override_by" varchar,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_note_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grn_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"description" text,
	"ordered_quantity" integer NOT NULL,
	"received_quantity" integer NOT NULL,
	"buying_price" numeric(12, 2) NOT NULL,
	"total_cost" numeric(12, 2)
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_notes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grn_number" text NOT NULL,
	"purchase_order_id" varchar NOT NULL,
	"warehouse_id" varchar NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"delivery_cost" numeric(12, 2),
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"received_date" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"supplier_challan_number" text,
	"supplier_challan_date" timestamp,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"supplier_challan_url" text,
	"supplier_challan_uploaded_by" varchar,
	"supplier_challan_uploaded_at" timestamp,
	"signed_copy_url" text,
	"signed_copy_uploaded_by" varchar,
	"signed_copy_uploaded_at" timestamp,
	"supplier_invoice_url" text,
	"supplier_invoice_uploaded_by" varchar,
	"supplier_invoice_uploaded_at" timestamp,
	"supplier_invoice_number" text,
	"supplier_invoice_date" timestamp,
	"confirmed_at" timestamp,
	"confirmed_by" varchar,
	"cancelled_at" timestamp,
	"cancelled_by" varchar,
	"cancellation_reason" text,
	"is_credit_override" boolean DEFAULT false NOT NULL,
	"credit_amount" numeric(12, 2),
	"credit_approved_by" varchar,
	"credit_approved_at" timestamp,
	"credit_reason" text,
	CONSTRAINT "goods_receipt_notes_grn_number_unique" UNIQUE("grn_number")
);
--> statement-breakpoint
CREATE TABLE "inventory_stock" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar NOT NULL,
	"warehouse_id" varchar NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text NOT NULL,
	"order_id" varchar,
	"customer_id" varchar NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"status" text DEFAULT 'unpaid' NOT NULL,
	"due_date" timestamp,
	"issued_date" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "late_arrival_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" varchar NOT NULL,
	"date" date NOT NULL,
	"expected_arrival_time" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar,
	"review_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar NOT NULL,
	"activity_type" text NOT NULL,
	"notes" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_followups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar NOT NULL,
	"title" text NOT NULL,
	"due_date" timestamp NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"company" text,
	"address" text,
	"gst_number" text,
	"requirement" text,
	"source" text DEFAULT 'call' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"assigned_to" varchar,
	"estimated_value" numeric(12, 2),
	"quotation_id" varchar,
	"notes" text,
	"loss_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" varchar NOT NULL,
	"type" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar,
	"review_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lender_name" text NOT NULL,
	"sanctioned_amount" numeric(14, 2) NOT NULL,
	"outstanding_amount" numeric(14, 2) NOT NULL,
	"interest_rate_pct" numeric(6, 3) NOT NULL,
	"disbursement_date" date NOT NULL,
	"maturity_date" date,
	"repayment_schedule_notes" text,
	"linked_cash_account_id" varchar,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_by" varchar NOT NULL,
	"updated_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" varchar NOT NULL,
	"trip_id" varchar,
	"lat" numeric(10, 7) NOT NULL,
	"lng" numeric(10, 7) NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"trip_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"related_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opening_balances" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_type" text NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"as_of_date" date NOT NULL,
	"notes" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" varchar,
	"amount" numeric(12, 2) NOT NULL,
	"method" text DEFAULT 'bank_transfer' NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"payment_date" timestamp DEFAULT now() NOT NULL,
	"reference" text,
	"cash_account_id" varchar
);
--> statement-breakpoint
CREATE TABLE "payroll_status" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_amount" numeric(12, 2),
	"disbursed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "product_bundle_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bundle_product_id" varchar NOT NULL,
	"component_product_id" varchar NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" text DEFAULT 'pcs' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sku" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"unit_price" numeric(12, 2) NOT NULL,
	"cost_price" numeric(12, 2),
	"brand" text,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"min_stock_level" integer DEFAULT 10 NOT NULL,
	"type" text DEFAULT 'product' NOT NULL,
	"hsn_code" text,
	"gst_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"needs_pricing_review" boolean DEFAULT false NOT NULL,
	"min_margin_pct" numeric(5, 2) DEFAULT '5.00' NOT NULL,
	"brand_id" varchar,
	"distributor_price" numeric(12, 2),
	"warranty_period" text,
	"mrp" numeric(12, 2),
	"specs" jsonb,
	"pack_size" text,
	"almm" boolean DEFAULT false NOT NULL,
	"dcr_compliant" boolean DEFAULT false NOT NULL,
	"model_series" text,
	"lifecycle_status" text DEFAULT 'active' NOT NULL,
	"replaced_by_product_id" varchar,
	"applicable_regions" text[],
	"price_list_version" text,
	"customer_tier_price" jsonb,
	"logistics_cost" numeric(10, 2),
	"target_margin_pct" numeric(5, 2),
	"product_family" varchar(100),
	"pricing_mode" text DEFAULT 'manual' NOT NULL,
	"grid_type" text DEFAULT 'others' NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"customer_id" varchar,
	"status" text DEFAULT 'planning' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"budget" numeric(12, 2),
	"assigned_to" varchar
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" varchar NOT NULL,
	"product_id" varchar,
	"description" text,
	"quantity" integer NOT NULL,
	"unit_cost" numeric(12, 2) NOT NULL,
	"total_cost" numeric(12, 2) NOT NULL,
	"hsn_code" text,
	"gst_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"taxable_amount" numeric(12, 2),
	"gst_amount" numeric(12, 2)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_number" text NOT NULL,
	"supplier_id" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"delivery_type" text DEFAULT 'warehouse' NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"order_date" timestamp DEFAULT now() NOT NULL,
	"expected_delivery" timestamp,
	"notes" text,
	"delivery_address" text,
	"cancellation_reason" text,
	"cancellation_requested_by" varchar,
	"cancellation_requested_at" timestamp,
	"advance_paid" numeric(12, 2) DEFAULT '0' NOT NULL,
	"subtotal" numeric(12, 2),
	"total_tax" numeric(12, 2),
	"delivery_cost" numeric(12, 2),
	"grand_total" numeric(12, 2),
	CONSTRAINT "purchase_orders_po_number_unique" UNIQUE("po_number")
);
--> statement-breakpoint
CREATE TABLE "purchase_request_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"description" text,
	"required_quantity" integer NOT NULL,
	"available_stock" integer DEFAULT 0 NOT NULL,
	"shortfall_quantity" integer NOT NULL,
	"unit_cost" numeric(12, 2),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_number" text NOT NULL,
	"sales_order_id" varchar,
	"supplier_id" varchar,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"notes" text,
	"purchase_order_id" varchar,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_requests_request_number_unique" UNIQUE("request_number")
);
--> statement-breakpoint
CREATE TABLE "quotation_activities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" varchar NOT NULL,
	"activity_type" text NOT NULL,
	"notes" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_followups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" varchar NOT NULL,
	"title" text NOT NULL,
	"due_date" timestamp NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" varchar NOT NULL,
	"product_id" varchar,
	"description" text,
	"item_type" text DEFAULT 'product' NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"total_price" numeric(12, 2) NOT NULL,
	"hsn_code" text,
	"gst_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"custom_components" jsonb,
	"is_floor_override" boolean DEFAULT false NOT NULL,
	"floor_override_reason" text
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_number" text NOT NULL,
	"customer_id" varchar NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"valid_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"discount_type" text,
	"discount_value" numeric(12, 2),
	"expected_delivery_date" timestamp,
	"delivery_method" text,
	"delivery_cost" numeric(12, 2),
	"delivery_address" text,
	"floor_override_by" varchar,
	"floor_override_at" timestamp,
	"created_by" varchar,
	CONSTRAINT "quotations_quote_number_unique" UNIQUE("quote_number")
);
--> statement-breakpoint
CREATE TABLE "report_generation_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_type" text NOT NULL,
	"generated_by" varchar NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"filters" jsonb,
	"format" text NOT NULL,
	"file_size_bytes" integer
);
--> statement-breakpoint
CREATE TABLE "sales_invoice_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" varchar NOT NULL,
	"product_id" varchar,
	"description" text NOT NULL,
	"qty" numeric(12, 3) NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"hsn_code" text,
	"gst_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"taxable_amount" numeric(12, 2) NOT NULL,
	"cgst" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sgst" numeric(12, 2) DEFAULT '0' NOT NULL,
	"igst" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(12, 2) NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_invoices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text NOT NULL,
	"invoice_date" timestamp DEFAULT now() NOT NULL,
	"customer_id" varchar NOT NULL,
	"so_id" varchar,
	"challan_id" varchar,
	"customer_type" text DEFAULT 'B2C' NOT NULL,
	"customer_gstin" text,
	"is_inter_state" boolean DEFAULT false NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"total_cgst" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_sgst" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_igst" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_tax" numeric(12, 2) NOT NULL,
	"grand_total" numeric(12, 2) NOT NULL,
	"credited_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_date" timestamp,
	"notes" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"upload_status" text DEFAULT 'pending_upload' NOT NULL,
	"ext_invoice_number" text,
	"ext_invoice_date" timestamp,
	"ext_total_amount" numeric(12, 2),
	"ext_gst_amount" numeric(12, 2),
	"upload_notes" text,
	"signed_copy_url" text,
	"signed_copy_uploaded_by" varchar,
	"signed_copy_uploaded_at" timestamp,
	"eway_bill_number" text,
	"eway_bill_date" timestamp,
	"eway_bill_url" text,
	"eway_bill_uploaded_by" varchar,
	"eway_bill_uploaded_at" timestamp,
	"cancelled_at" timestamp,
	"cancelled_by" varchar,
	"cancellation_reason" text,
	CONSTRAINT "sales_invoices_invoice_number_unique" UNIQUE("invoice_number"),
	CONSTRAINT "sales_invoices_challan_id_unique" UNIQUE("challan_id")
);
--> statement-breakpoint
CREATE TABLE "sales_order_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"product_id" varchar,
	"description" text,
	"item_type" text DEFAULT 'product' NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"total_price" numeric(12, 2) NOT NULL,
	"hsn_code" text,
	"gst_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"is_floor_override" boolean DEFAULT false NOT NULL,
	"floor_override_reason" text
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"customer_id" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_tax" numeric(12, 2) DEFAULT '0' NOT NULL,
	"order_date" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"discount_type" text,
	"discount_value" numeric(12, 2),
	"payment_terms" text,
	"advance_amount" numeric(12, 2),
	"paid_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"expected_delivery_date" timestamp,
	"delivery_method" text,
	"delivery_cost" numeric(12, 2),
	"delivery_address" text,
	"warehouse_id" varchar,
	"subsidy_scheme" text DEFAULT 'none' NOT NULL,
	"is_dues_override" boolean DEFAULT false NOT NULL,
	"dues_override_amount" numeric(12, 2),
	"dues_override_by" varchar,
	"dues_override_at" timestamp,
	"dues_override_reason" text,
	"floor_override_by" varchar,
	"floor_override_at" timestamp,
	CONSTRAINT "sales_orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "sales_return_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_return_id" varchar NOT NULL,
	"invoice_item_id" varchar,
	"product_id" varchar,
	"description" text NOT NULL,
	"qty_sold" numeric(12, 3) NOT NULL,
	"qty_already_returned" numeric(12, 3) DEFAULT '0' NOT NULL,
	"qty_returned" numeric(12, 3) DEFAULT '0' NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"hsn_code" text,
	"gst_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"taxable_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cgst" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sgst" numeric(12, 2) DEFAULT '0' NOT NULL,
	"igst" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_returns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_number" text NOT NULL,
	"invoice_id" varchar NOT NULL,
	"challan_id" varchar,
	"so_id" varchar,
	"customer_id" varchar NOT NULL,
	"warehouse_id" varchar,
	"status" text DEFAULT 'draft' NOT NULL,
	"return_type" text DEFAULT 'customer_rejection' NOT NULL,
	"reason" text,
	"return_date" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sales_returns_return_number_unique" UNIQUE("return_number")
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar NOT NULL,
	"warehouse_id" varchar,
	"movement_type" text NOT NULL,
	"quantity" integer NOT NULL,
	"reference_type" text,
	"reference_id" varchar,
	"grn_id" varchar,
	"notes" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_invoices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text,
	"supplier_id" varchar NOT NULL,
	"purchase_order_id" varchar,
	"grn_id" varchar,
	"invoice_date" timestamp DEFAULT now() NOT NULL,
	"subtotal" numeric(12, 2),
	"tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(12, 2),
	"payment_terms" text DEFAULT 'net_30' NOT NULL,
	"due_date" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"upload_status" text DEFAULT 'pending_upload' NOT NULL,
	"signed_copy_url" text,
	"signed_copy_uploaded_by" varchar,
	"signed_copy_uploaded_at" timestamp,
	"is_credit_grn" boolean DEFAULT false NOT NULL,
	"credit_amount" numeric(12, 2),
	"cancelled_at" timestamp,
	"cancelled_by" varchar,
	"cancellation_reason" text,
	"ext_invoice_number" text,
	"ext_invoice_date" timestamp,
	"ext_total_amount" numeric(12, 2),
	"ext_gst_amount" numeric(12, 2)
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_invoice_id" varchar,
	"purchase_order_id" varchar,
	"supplier_id" varchar NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_type" text DEFAULT 'regular' NOT NULL,
	"payment_method" text DEFAULT 'bank_transfer' NOT NULL,
	"payment_date" timestamp DEFAULT now() NOT NULL,
	"reference" text,
	"cash_account_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_products" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"supplier_price" numeric(12, 2) NOT NULL,
	"supplier_sku" text,
	"lead_time_days" integer,
	"is_preferred" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"last_price_updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"address" text,
	"gst_number" text,
	"contact_person" text,
	"category" text,
	"payment_terms" text DEFAULT 'net_30' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "travel_expenses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" varchar NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"origin_lat" numeric(10, 7) NOT NULL,
	"origin_lng" numeric(10, 7) NOT NULL,
	"dest_lat" numeric(10, 7) NOT NULL,
	"dest_lng" numeric(10, 7) NOT NULL,
	"origin_address" text,
	"dest_address" text,
	"distance" numeric(8, 2) NOT NULL,
	"transport_mode" text NOT NULL,
	"travel_cost" numeric(10, 2) NOT NULL,
	"lunch_money" numeric(10, 2) DEFAULT '200' NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"rejection_reason" text,
	"approved_at" timestamp,
	"disbursed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" varchar NOT NULL,
	"start_time" timestamp DEFAULT now() NOT NULL,
	"end_time" timestamp,
	"start_lat" numeric(10, 7),
	"start_lng" numeric(10, 7),
	"start_address" text,
	"end_lat" numeric(10, 7),
	"end_lng" numeric(10, 7),
	"end_address" text,
	"status" text DEFAULT 'active' NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" DEFAULT 'admin' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"capacity" integer
);
--> statement-breakpoint
CREATE TABLE "whatsapp_conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"contact_name" text,
	"customer_id" varchar,
	"lead_id" varchar,
	"status" text DEFAULT 'open' NOT NULL,
	"tag" text,
	"assigned_to" varchar,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"window_expires_at" timestamp,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"direction" text NOT NULL,
	"body" text,
	"message_type" text DEFAULT 'text' NOT NULL,
	"interakt_message_id" text,
	"status" text,
	"media_url" text,
	"sent_by" varchar,
	"is_note" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_template_status_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar NOT NULL,
	"previous_status" text,
	"new_status" text NOT NULL,
	"source" text DEFAULT 'scheduled' NOT NULL,
	"changed_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_template_sync_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_at" timestamp DEFAULT now() NOT NULL,
	"trigger" text NOT NULL,
	"success" boolean NOT NULL,
	"error_message" text,
	"total" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"status_changes_count" integer DEFAULT 0 NOT NULL,
	"status_changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"triggered_by_user_id" varchar,
	"triggered_by_name" text
);
--> statement-breakpoint
CREATE TABLE "whatsapp_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"template_id" text NOT NULL,
	"category" text DEFAULT 'custom' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"body" text NOT NULL,
	"variables" text[] DEFAULT '{}'::text[] NOT NULL,
	"example_values" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_webhook_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_run_at" timestamp DEFAULT now() NOT NULL,
	"locked_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_webhook_jobs_dead_letter" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_job_id" varchar,
	"job_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"last_error" text,
	"attempts" integer NOT NULL,
	"manual_retry_attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"dead_lettered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_webhook_rejected_payloads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reason" text NOT NULL,
	"http_status" integer NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"query" jsonb,
	"headers" jsonb,
	"raw_body" text,
	"raw_body_truncated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_from_account_id_cash_accounts_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_to_account_id_cash_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_adjustments" ADD CONSTRAINT "balance_adjustments_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_adjustments" ADD CONSTRAINT "balance_adjustments_adjusted_by_users_id_fk" FOREIGN KEY ("adjusted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equity_accounts" ADD CONSTRAINT "equity_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equity_accounts" ADD CONSTRAINT "equity_accounts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_user_id_users_id_fk" FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_accumulated_dep_override_by_users_id_fk" FOREIGN KEY ("accumulated_dep_override_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_linked_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("linked_cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bundle_items" ADD CONSTRAINT "product_bundle_items_bundle_product_id_products_id_fk" FOREIGN KEY ("bundle_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bundle_items" ADD CONSTRAINT "product_bundle_items_component_product_id_products_id_fk" FOREIGN KEY ("component_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_account_transfers_from" ON "account_transfers" USING btree ("from_account_id");--> statement-breakpoint
CREATE INDEX "idx_account_transfers_to" ON "account_transfers" USING btree ("to_account_id");--> statement-breakpoint
CREATE INDEX "idx_account_transfers_date" ON "account_transfers" USING btree ("transfer_date");--> statement-breakpoint
CREATE INDEX "attachments_entity_idx" ON "attachments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_balance_adjustments_account" ON "balance_adjustments" USING btree ("cash_account_id");--> statement-breakpoint
CREATE INDEX "idx_balance_adjustments_date" ON "balance_adjustments" USING btree ("adjustment_date");--> statement-breakpoint
CREATE UNIQUE INDEX "cfus_unique_cat_key" ON "custom_field_usage_stats" USING btree ("category","field_key");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_price_sheets_product_date_uniq" ON "daily_price_sheets" USING btree ("product_id","sheet_date");--> statement-breakpoint
CREATE INDEX "idx_debug_capture_source_event" ON "debug_payload_captures" USING btree ("source","event_type");--> statement-breakpoint
CREATE INDEX "idx_debug_capture_created" ON "debug_payload_captures" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_equity_accounts_type" ON "equity_accounts" USING btree ("account_type");--> statement-breakpoint
CREATE INDEX "idx_equity_accounts_active" ON "equity_accounts" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "expense_categories_active_idx" ON "expense_categories" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("expense_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "expenses_paid_by_idx" ON "expenses" USING btree ("paid_by_user_id");--> statement-breakpoint
CREATE INDEX "expenses_paid_by_date_idx" ON "expenses" USING btree ("paid_by_user_id","expense_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "expenses_created_by_idx" ON "expenses" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "expenses_linked_entity_idx" ON "expenses" USING btree ("linked_entity_type","linked_entity_id");--> statement-breakpoint
CREATE INDEX "expenses_created_at_idx" ON "expenses" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_fixed_assets_category" ON "fixed_assets" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_fixed_assets_is_active" ON "fixed_assets" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_grn_items_product_id" ON "goods_receipt_note_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_loans_status" ON "loans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_loans_maturity" ON "loans" USING btree ("maturity_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_opening_balances_type_label" ON "opening_balances" USING btree ("account_type","label");--> statement-breakpoint
CREATE INDEX "idx_opening_balances_date" ON "opening_balances" USING btree ("as_of_date");--> statement-breakpoint
CREATE INDEX "pbi_bundle_idx" ON "product_bundle_items" USING btree ("bundle_product_id");--> statement-breakpoint
CREATE INDEX "pbi_component_idx" ON "product_bundle_items" USING btree ("component_product_id");--> statement-breakpoint
CREATE INDEX "idx_report_gen_log_type_at" ON "report_generation_log" USING btree ("report_type","generated_at");--> statement-breakpoint
CREATE INDEX "idx_report_gen_log_user" ON "report_generation_log" USING btree ("generated_by");--> statement-breakpoint
CREATE INDEX "idx_stock_movements_product_id" ON "stock_movements" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_stock_movements_created_at" ON "stock_movements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_stock_movements_grn_id" ON "stock_movements" USING btree ("grn_id");--> statement-breakpoint
CREATE INDEX "idx_wa_tmpl_status_hist_template" ON "whatsapp_template_status_history" USING btree ("template_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_wa_template_sync_logs_attempt_at" ON "whatsapp_template_sync_logs" USING btree ("attempt_at");--> statement-breakpoint
CREATE INDEX "idx_wa_jobs_pickup" ON "whatsapp_webhook_jobs" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE INDEX "idx_wa_jobs_payload_hash" ON "whatsapp_webhook_jobs" USING btree ("payload_hash");--> statement-breakpoint
CREATE INDEX "idx_wa_rejected_created" ON "whatsapp_webhook_rejected_payloads" USING btree ("created_at");