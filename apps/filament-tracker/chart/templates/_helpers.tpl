{{/* Common labels. Call with (dict "name" <svc> "component" <role> "root" $) */}}
{{- define "ft.labels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/component: {{ .component }}
app.kubernetes.io/part-of: filament-tracker
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
helm.sh/chart: {{ .root.Chart.Name }}-{{ .root.Chart.Version }}
{{- end -}}

{{/* Selector labels (stable subset). Call with (dict "name" <svc>) */}}
{{- define "ft.selectorLabels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/part-of: filament-tracker
{{- end -}}

{{/* Fully-qualified image ref. Call with (dict "image" <comp> "root" $) */}}
{{- define "ft.image" -}}
{{- $r := .root.Values.image -}}
{{- printf "%s/%s/%s:%s" $r.registry $r.owner .image $r.tag -}}
{{- end -}}
