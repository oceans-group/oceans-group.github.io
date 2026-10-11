import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  BarElement, CategoryScale, LinearScale,
} from 'chart.js'
import ChartDataLabels from 'chartjs-plugin-datalabels'

ChartJS.register(ArcElement, Tooltip, Legend, BarElement, CategoryScale, LinearScale, ChartDataLabels)

export const CHART_COLORS = [
  '#2563eb', '#7c3aed', '#16a34a', '#d97706', '#dc2626',
  '#0891b2', '#9333ea', '#65a30d', '#ea580c', '#be185d',
]
