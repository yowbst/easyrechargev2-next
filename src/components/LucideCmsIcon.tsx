import {
  // Navigation & UI
  Home, Menu, X, ChevronRight, ChevronDown, ChevronUp, ChevronLeft,
  ArrowRight, ArrowLeft, ExternalLink, Link,
  // Communication
  Mail, Phone, MessageCircle, Send, AtSign,
  // Social / brand
  Globe, Facebook, Instagram, Twitter, Linkedin, Youtube, Github,
  // Business
  Building2, Briefcase, Users, UserCircle, Award, Star,
  Shield, ShieldCheck, BadgeCheck, CheckCircle, Check,
  // Location
  MapPin, Map, Navigation, Compass,
  // Content
  FileText, BookOpen, Newspaper, PenLine, ClipboardList,
  // Time & scheduling
  Clock, Calendar, Timer,
  // Technology
  Zap, Plug, Battery, BatteryCharging, Wifi, Settings, Wrench,
  // Nature & energy
  Sun, Leaf, Lightbulb, Flame,
  // Finance
  DollarSign, CreditCard, Receipt, TrendingUp,
  // Vehicles
  Car, Truck,
  // Misc
  Heart, Info, AlertCircle, HelpCircle, Search, Eye, Download,
  Key, Lock, Unlock, Target, Gift, Package, CircleDot, Circle,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Home, Menu, X, ChevronRight, ChevronDown, ChevronUp, ChevronLeft,
  ArrowRight, ArrowLeft, ExternalLink, Link,
  Mail, Phone, MessageCircle, Send, AtSign,
  Globe, Facebook, Instagram, Twitter, Linkedin, Youtube, Github,
  Building2, Briefcase, Users, UserCircle, Award, Star,
  Shield, ShieldCheck, BadgeCheck, CheckCircle, Check,
  MapPin, Map, Navigation, Compass,
  FileText, BookOpen, Newspaper, PenLine, ClipboardList,
  Clock, Calendar, Timer,
  Zap, Plug, Battery, BatteryCharging, Wifi, Settings, Wrench,
  Sun, Leaf, Lightbulb, Flame,
  DollarSign, CreditCard, Receipt, TrendingUp,
  Car, Truck,
  Heart, Info, AlertCircle, HelpCircle, Search, Eye, Download,
  Key, Lock, Unlock, Target, Gift, Package, CircleDot, Circle,
};

type Props = {
  name?: string | null;
  className?: string;
};

export function LucideCmsIcon({ name, className = "" }: Props) {
  if (!name) return null;
  const IconComponent = ICON_MAP[name];
  if (!IconComponent) return null;
  return <IconComponent className={className} />;
}
