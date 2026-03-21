export interface FormSession {
  id: string;
  session_token: string;
  form_type: string;
  locale: string | null;
  user_agent: string | null;
  location_path: string | null;
  location_route: string | null;
  location_params: string | null;
  color_scheme: string | null;
  ph_distinct_id: string | null;
  ph_session_id: string | null;
  date_created: string;
}

export interface FormUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  submission_count: number;
  date_created: string;
  date_updated: string;
}

export interface FormSubmission {
  id: string;
  session: string | FormSession | null;
  user: string | FormUser | null;
  form_type: string;
  location_route: string | null;
  location_path: string | null;
  location_params: string | null;
  data: Record<string, unknown>;
  status: string;
  date_created: string;
}

export interface Locality {
  id: string;
  postal_code: string;
  locality: string;
  canton: string;
}
