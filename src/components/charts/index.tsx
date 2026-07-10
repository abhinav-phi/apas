import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

const COSMIC_COLORS = {
  teal: "#71ffe8",
  tealDim: "rgba(113,255,232,0.6)",
  amber: "#f9bc48",
  red: "#ffb4ab",
  blue: "#60a5fa",
  purple: "#a78bfa",
  grid: "rgba(113,255,232,0.06)",
  axis: "#849490",
};

const PIE_COLORS = [COSMIC_COLORS.teal, COSMIC_COLORS.amber, COSMIC_COLORS.blue, COSMIC_COLORS.red, COSMIC_COLORS.purple, "#34d399"];

const tooltipStyle = {
  backgroundColor: "#161B22",
  border: "1px solid rgba(113,255,232,0.15)",
  borderRadius: "8px",
  color: "#dfe2eb",
  fontSize: "12px",
  fontFamily: "IBM Plex Mono, monospace",
};

// ─────────────────────────────────────────────────────
// TimeSeriesChart — Line chart for time-series data
// ─────────────────────────────────────────────────────
interface TimeSeriesDataPoint {
  date: string;
  value: number;
}

interface TimeSeriesChartProps {
  data: TimeSeriesDataPoint[];
  color?: string;
  label?: string;
  height?: number;
}

export function TimeSeriesChart({
  data,
  color = COSMIC_COLORS.teal,
  label = "Count",
  height = 200,
}: TimeSeriesChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground text-sm" style={{ height }}>
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COSMIC_COLORS.grid} />
        <XAxis dataKey="date" stroke={COSMIC_COLORS.axis} tick={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fill: COSMIC_COLORS.axis }} />
        <YAxis stroke={COSMIC_COLORS.axis} tick={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fill: COSMIC_COLORS.axis }} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="value" name={label} stroke={color} strokeWidth={2} dot={{ fill: color, strokeWidth: 0, r: 3 }} activeDot={{ r: 5, fill: color }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────
// BarChartComponent — Bar chart for daily/weekly data
// ─────────────────────────────────────────────────────
interface BarDataPoint {
  date: string;
  value: number;
}

interface BarChartComponentProps {
  data: BarDataPoint[];
  color?: string;
  label?: string;
  height?: number;
}

export function BarChartComponent({
  data,
  color = COSMIC_COLORS.teal,
  label = "Count",
  height = 200,
}: BarChartComponentProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground text-sm" style={{ height }}>
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COSMIC_COLORS.grid} />
        <XAxis dataKey="date" stroke={COSMIC_COLORS.axis} tick={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fill: COSMIC_COLORS.axis }} />
        <YAxis stroke={COSMIC_COLORS.axis} tick={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fill: COSMIC_COLORS.axis }} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="value" name={label} fill={color} fillOpacity={0.8} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────
// CategoryPieChart — Donut chart for categories
// ─────────────────────────────────────────────────────
interface CategoryDataPoint {
  name: string;
  value: number;
}

interface CategoryPieChartProps {
  data: CategoryDataPoint[];
  height?: number;
}

export function CategoryPieChart({ data, height = 220 }: CategoryPieChartProps) {
  if (!data || data.length === 0 || data.every((d) => d.value === 0)) {
    return (
      <div className="flex items-center justify-center text-muted-foreground text-sm" style={{ height }}>
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((_entry, index) => (
            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend
          wrapperStyle={{ fontSize: "11px", fontFamily: "IBM Plex Mono, monospace", color: COSMIC_COLORS.axis }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
