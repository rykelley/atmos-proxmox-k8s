{{/* Common labels. */}}
{{- define "vllm-pipeline.labels" -}}
app.kubernetes.io/name: {{ .Values.appName }}
app.kubernetes.io/component: inference
app.kubernetes.io/part-of: vllm-pipeline
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{/* Selector labels (stable subset; must never change on an existing workload). */}}
{{- define "vllm-pipeline.selectorLabels" -}}
app.kubernetes.io/name: {{ .Values.appName }}
app.kubernetes.io/part-of: vllm-pipeline
{{- end -}}

{{/* Whether to back the model cache with a PVC (size != "0"). */}}
{{- define "vllm-pipeline.persistModelCache" -}}
{{- if and .Values.modelCache.size (ne (.Values.modelCache.size | toString) "0") -}}true{{- else -}}false{{- end -}}
{{- end -}}
