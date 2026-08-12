{{/* Common labels. */}}
{{- define "vllm-server.labels" -}}
app.kubernetes.io/name: {{ .Values.appName }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: inference
app.kubernetes.io/part-of: model-promotion
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "vllm-server.selectorLabels" -}}
app.kubernetes.io/name: {{ .Values.appName }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/part-of: model-promotion
{{- end -}}

{{- define "vllm-server.persistModelCache" -}}
{{- if and .Values.modelCache.size (ne (.Values.modelCache.size | toString) "0") -}}true{{- else -}}false{{- end -}}
{{- end -}}

{{/*
Digest-pinned image reference. Prefer image.digest (sha256:...) over floating tags.
*/}}
{{- define "vllm-server.image" -}}
{{- if .Values.image.digest -}}
{{ .Values.image.repository }}@{{ .Values.image.digest }}
{{- else -}}
{{ .Values.image.repository }}:{{ .Values.image.tag }}
{{- end -}}
{{- end -}}
