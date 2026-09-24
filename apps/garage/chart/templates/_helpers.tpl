{{- define "garage.labels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/component: {{ .component }}
app.kubernetes.io/part-of: garage
app.kubernetes.io/managed-by: Helm
{{- end -}}

{{- define "garage.selectorLabels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/part-of: garage
{{- end -}}
