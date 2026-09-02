export interface PledgeRecord {
  rowIndex?: number;
  number: number;
  name: string;
  phone: string;
  item_name: string;
  no_of_items: number;
  net_weight: number;
  amount: number;
  pledge_date: string;
  release_date: string;
  locker: string;
}

export interface Submission {
  id: number;
  rowIndex: number;
  submitted_by: string;
  submitted_at: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  record: {
    name: string;
    phone: string;
    item_name: string;
    amount: number;
    net_weight: number;
    no_of_items: number;
    pledge_date: string;
    locker: string;
  };
  assigned_number?: number;
}

export interface ActivityLog {
  time: string;
  username: string;
  action: string;
  detail: string;
}

export interface OnlineUser {
  username: string;
  role: string;
  idle_seconds: number;
}

export interface DashboardStats {
  online_users: OnlineUser[];
  total_records: number;
  pending_count: number;
  total_weight: number;
  total_amount: number;
  activity_log: ActivityLog[];
}

export interface SessionInfo {
  username: string;
  role: "admin" | "user";
}
