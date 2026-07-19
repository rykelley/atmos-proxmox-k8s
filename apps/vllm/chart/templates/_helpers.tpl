{{/* Common labels. Call with (dict "name" <svc> "component" <role> "root" $) */}}
{{- define "vllm.labels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/component: {{ .component }}
app.kubernetes.io/part-of: vllm
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
helm.sh/chart: {{ .root.Chart.Name }}-{{ .root.Chart.Version }}
{{- end -}}

{{/* Selector labels (stable subset). Call with (dict "name" <svc>) */}}
{{- define "vllm.selectorLabels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/part-of: vllm
{{- end -}}

{{/* Whether to back the model cache with a PVC (size != "0"). */}}
{{- define "vllm.persistModelCache" -}}
{{- if and .Values.modelCache.size (ne (.Values.modelCache.size | toString) "0") -}}true{{- else -}}false{{- end -}}
{{- end -}}
