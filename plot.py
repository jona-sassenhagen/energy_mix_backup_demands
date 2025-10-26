import dash
from dash import dcc, html, Input, Output
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import pandas as pd
from datetime import datetime, timedelta
import numpy as np

capacities_dict = {'Wind offshore': 0.11666666666666667,
 'Wind onshore': 0.24166666666666667,
 'Solar': 0.6416666666666667,
 'Nuclear': 0.0}

colors = {
    'Nuclear': '#9B59B6',      # Purple
    'Wind offshore': '#4A90E2', # Blue
    'Wind onshore': '#7CB9E8',  # Light blue
    'Solar': '#FDB813',         # Orange/yellow
    'Storage potential': '#2ECC71',  # Green (storing excess)
    'Storage consumption requirement': '#E74C3C', # Red (discharging deficit)
    'Load': 'k',
}

df_cf = pd.read_csv('scenarios/df_cf.csv', index_col=[0], parse_dates=[0])

# Define the plotting function
def create_interactive_energy_plot(df_cf, capacities_dict, colors, nuclear_fractions, 
                                   start_date, end_date):
    """
    Create an interactive Plotly chart showing energy generation mix with adjustable nuclear fraction.
    Returns figure, battery capacities, and installed capacities for each scenario.
    """
    battery_capacities = []
    installed_capacities = []
    scenario_data = []  # Store all scenario data
    
    # First pass: calculate ALL scenario data and find global limits
    for nuclear_fraction in nuclear_fractions:
        df_cf_period = df_cf.loc[start_date:end_date].copy()
        
        # Calculate total load energy over the period
        total_load_energy = df_cf_period['Load'].sum()
        
        # Calculate nuclear installed capacity
        nuclear_generation_needed = nuclear_fraction * total_load_energy
        nuclear_cf_sum = df_cf_period['Nuclear'].sum()
        nuclear_installed = nuclear_generation_needed / nuclear_cf_sum if nuclear_cf_sum > 0 else 0
        
        # Calculate renewable installed capacities
        renewable_generation_needed = (1 - nuclear_fraction) * total_load_energy
        
        # Weighted sum of renewable capacity factors
        renewable_cf_weighted = (
            capacities_dict['Solar'] * df_cf_period['Solar'].sum() +
            capacities_dict['Wind onshore'] * df_cf_period['Wind onshore'].sum() +
            capacities_dict['Wind offshore'] * df_cf_period['Wind offshore'].sum()
        )
        
        # Total renewable installed capacity
        C = renewable_generation_needed / renewable_cf_weighted if renewable_cf_weighted > 0 else 0
        
        # Individual renewable installed capacities
        solar_installed = capacities_dict['Solar'] * C
        wind_onshore_installed = capacities_dict['Wind onshore'] * C
        wind_offshore_installed = capacities_dict['Wind offshore'] * C
        
        # Store installed capacities
        installed_capacity = {
            'Nuclear': nuclear_installed,
            'Wind offshore': wind_offshore_installed,
            'Wind onshore': wind_onshore_installed,
            'Solar': solar_installed
        }
        installed_capacities.append(installed_capacity)
        
        # Generate actual power profiles
        df_ = pd.DataFrame(index=df_cf_period.index)
        df_['Nuclear'] = df_cf_period['Nuclear'] * nuclear_installed
        df_['Wind offshore'] = df_cf_period['Wind offshore'] * wind_offshore_installed
        df_['Wind onshore'] = df_cf_period['Wind onshore'] * wind_onshore_installed
        df_['Solar'] = df_cf_period['Solar'] * solar_installed
        
        load = df_cf_period['Load'].copy()
        
        # Calculate battery and storage requirements
        bess = (df_.sum(axis=1) - load)
        df_['Storage potential'] = -bess.clip(lower=0)
        df_['Storage consumption requirement'] = -bess.clip(upper=0)
        
        # Calculate battery capacity
        peak_surplus = bess.clip(lower=0).max()
        peak_deficit = (-bess.clip(upper=0)).max()
        battery_capacity = max(peak_surplus, peak_deficit)
        battery_capacities.append(battery_capacity)
        
        # Store data for this scenario
        scenario_data.append({
            'df': df_.copy(),
            'load': load.copy(),
            'nuclear_fraction': nuclear_fraction
        })
    
    # Calculate global y-axis limits from ALL scenarios
    all_max_positive = []
    all_min_negative = []
    
    for data in scenario_data:
        df_ = data['df']
        
        # For POSITIVE values: sum only the generation sources
        positive_generation = (
            df_['Nuclear'] + 
            df_['Wind offshore'] + 
            df_['Wind onshore'] + 
            df_['Solar']
        )
        max_positive = positive_generation.max()
        all_max_positive.append(max_positive)
        
        # For NEGATIVE values
        min_storage_potential = df_['Storage potential'].min()
        min_consumption = df_['Storage consumption requirement'].min()
        min_negative = min(min_storage_potential, min_consumption)
        all_min_negative.append(min_negative)
    
    # Global y-axis limits across ALL scenarios
    y_max = max(all_max_positive)
    y_min = min(all_min_negative)
    y_range = y_max - y_min
    padding = y_range * 0.1
    
    final_y_min = y_min - padding
    final_y_max = y_max + padding
    
    # Create subplots
    fig = make_subplots(
        rows=len(nuclear_fractions), 
        cols=1,
        subplot_titles=[f'Nuclear share: {round(data["nuclear_fraction"] * 100)}%' for data in scenario_data],
        vertical_spacing=0.08,
        shared_xaxes=True,
        shared_yaxes=True
    )
    
    # Second pass: create the actual plots using stored data
    for ii, data in enumerate(scenario_data):
        row_num = ii + 1
        df_ = data['df']
        load = data['load']
        
        # Add positive stacked bars
        positive_cols = ['Nuclear', 'Wind offshore', 'Wind onshore', 'Solar', 'Storage potential']
        for col in positive_cols:
            fig.add_trace(
                go.Bar(
                    name=col,
                    x=df_.index,
                    y=df_[col],
                    marker_color=colors.get(col, None),
                    legendgroup=col,
                    showlegend=(ii == 0),
                    hovertemplate='<b>%{fullData.name}</b><br>' +
                                  'Time: %{x}<br>' +
                                  'Power: %{y:.2f}<br>' +
                                  '<extra></extra>'
                ),
                row=row_num,
                col=1
            )
        
        # Add negative stacked bar
        fig.add_trace(
            go.Bar(
                name='Storage consumption requirement',
                x=df_.index,
                y=df_['Storage consumption requirement'],
                marker_color=colors.get('Storage consumption requirement', None),
                legendgroup='Storage consumption requirement',
                showlegend=(ii == 0),
                hovertemplate='<b>Storage consumption requirement</b><br>' +
                              'Time: %{x}<br>' +
                              'Power: %{y:.2f}<br>' +
                              '<extra></extra>'
            ),
            row=row_num,
            col=1
        )
        
        # Add load line
        fig.add_trace(
            go.Scatter(
                name='Load',
                x=load.index,
                y=load.values,
                mode='lines',
                line=dict(color='black', width=2),
                legendgroup='Load',
                showlegend=(ii == 0),
                hovertemplate='<b>Load</b><br>' +
                              'Time: %{x}<br>' +
                              'Power: %{y:.2f}<br>' +
                              '<extra></extra>'
            ),
            row=row_num,
            col=1
        )
    
    # Update layout with y-axis range
    fig.update_layout(
        height=400 * len(nuclear_fractions),
        width=1200,
        title_text=f"Energy Mix Analysis: {start_date} to {end_date}",
        title_font_size=20,
        barmode='relative',
        hovermode='x unified',
        showlegend=True,
        legend=dict(
            orientation="v",
            yanchor="top",
            y=1,
            xanchor="left",
            x=1.02
        )
    )
    
    # Update x-axis
    fig.update_xaxes(title_text="Time", row=len(nuclear_fractions), col=1)
    
    # Set y-axis range
    fig.update_yaxes(
        title_text="Power (MW)",
        range=[final_y_min, final_y_max],
        autorange=False,
        fixedrange=False
    )
    
    # Add horizontal line at y=0
    for i in range(1, len(nuclear_fractions) + 1):
        fig.add_hline(y=0, line_width=1, line_dash="dash", line_color="gray", 
                      row=i, col=1)
    
    return fig, battery_capacities, installed_capacities


def create_capacity_donut(installed_capacity, colors):
    """Create a donut chart for installed capacity"""
    labels = list(installed_capacity.keys())
    values = list(installed_capacity.values())
    chart_colors = [colors.get(label, '#999999') for label in labels]
    
    fig = go.Figure(data=[go.Pie(
        labels=labels,
        values=values,
        hole=.5,
        marker=dict(colors=chart_colors),
        textposition='inside',
        textinfo='label+percent',
        hovertemplate='<b>%{label}</b><br>Capacity: %{value:.0f} MW<br>%{percent}<extra></extra>'
    )])
    
    total_capacity = sum(values)
    fig.update_layout(
        showlegend=False,
        height=200,
        width=200,
        margin=dict(l=10, r=10, t=30, b=10),
        annotations=[dict(text=f'{total_capacity:,.0f} MW', x=0.5, y=0.5, 
                         font_size=14, showarrow=False, font=dict(weight='bold'))]
    )
    
    return fig


# Get date range from df_cf
min_date = df_cf.index.min().date()
max_date = df_cf.index.max().date()

# Initialize Dash app
app = dash.Dash(__name__)

app.layout = html.Div([
    html.H1("Interactive Energy Mix Analysis", style={'textAlign': 'center'}),
    
    html.Div([
        html.Div([
            html.Label("Start Date:", style={'fontWeight': 'bold', 'marginBottom': '5px'}),
            dcc.DatePickerSingle(
                id='start-date-picker',
                min_date_allowed=min_date,
                max_date_allowed=max_date,
                initial_visible_month=min_date,
                date=min_date,
                display_format='YYYY-MM-DD',
                style={'width': '100%'}
            ),
            html.Br(),
            html.Br(),
            html.Label("Time Window:", style={'fontWeight': 'bold', 'marginBottom': '5px'}),
            dcc.Dropdown(
                id='duration-dropdown',
                options=[
                    {'label': '1 day', 'value': 1},
                    {'label': '3 days', 'value': 3},
                    {'label': '1 week', 'value': 7},
                    {'label': '2 weeks', 'value': 14},
                    {'label': '1 month (30 days)', 'value': 30},
                    {'label': '6 weeks', 'value': 42},
                    {'label': '2 months (60 days)', 'value': 60},
                    {'label': '3 months (90 days)', 'value': 90},
                ],
                value=7,  # Default to 1 week
                clearable=False,
                style={'width': '100%'}
            ),
            html.Div(id='date-info', style={
                'fontSize': '12px', 
                'marginTop': '10px',
                'color': '#666'
            }),
            html.Div(id='date-range-warning', style={
                'color': 'red', 
                'fontSize': '12px', 
                'marginTop': '5px',
                'minHeight': '20px'
            })
        ], style={'width': '48%', 'display': 'inline-block', 'padding': '10px', 'verticalAlign': 'top'}),
        
        html.Div([
            html.Label("Select Nuclear Scenarios (%):", style={'fontWeight': 'bold'}),
            html.Div([
                # Scenario 1
                html.Div([
                    html.Div([
                        html.Div([
                            html.Label("Scenario 1:", style={'fontSize': '14px', 'marginBottom': '5px', 'display': 'inline-block', 'width': '80px'}),
                            html.Span(id='backup-capacity-1', style={
                                'fontSize': '13px', 
                                'color': '#2E86AB',
                                'fontWeight': 'bold',
                                'marginLeft': '10px'
                            })
                        ]),
                        dcc.Slider(
                            id='nuclear-slider-1',
                            min=0,
                            max=100,
                            step=5,
                            value=0,
                            marks={i: f'{i}%' for i in range(0, 101, 20)},
                            tooltip={"placement": "bottom", "always_visible": True}
                        ),
                    ], style={'flex': '1'}),
                    html.Div([
                        dcc.Graph(id='donut-1', config={'displayModeBar': False})
                    ], style={'width': '200px', 'marginLeft': '20px'})
                ], style={'display': 'flex', 'alignItems': 'center', 'marginBottom': '15px'}),
                
                # Scenario 2
                html.Div([
                    html.Div([
                        html.Div([
                            html.Label("Scenario 2:", style={'fontSize': '14px', 'marginBottom': '5px', 'display': 'inline-block', 'width': '80px'}),
                            html.Span(id='backup-capacity-2', style={
                                'fontSize': '13px', 
                                'color': '#2E86AB',
                                'fontWeight': 'bold',
                                'marginLeft': '10px'
                            })
                        ]),
                        dcc.Slider(
                            id='nuclear-slider-2',
                            min=0,
                            max=100,
                            step=5,
                            value=20,
                            marks={i: f'{i}%' for i in range(0, 101, 20)},
                            tooltip={"placement": "bottom", "always_visible": True}
                        ),
                    ], style={'flex': '1'}),
                    html.Div([
                        dcc.Graph(id='donut-2', config={'displayModeBar': False})
                    ], style={'width': '200px', 'marginLeft': '20px'})
                ], style={'display': 'flex', 'alignItems': 'center', 'marginBottom': '10px'}),
            ])
        ], style={'width': '48%', 'float': 'right', 'display': 'inline-block', 'padding': '10px'}),
    ], style={'marginBottom': '20px', 'overflow': 'hidden'}),
    
    dcc.Graph(id='energy-mix-graph', style={'height': '90vh'})
], style={'padding': '20px'})


@app.callback(
    [Output('energy-mix-graph', 'figure'),
     Output('date-range-warning', 'children'),
     Output('date-info', 'children'),
     Output('backup-capacity-1', 'children'),
     Output('backup-capacity-2', 'children'),
     Output('donut-1', 'figure'),
     Output('donut-2', 'figure')],
    [Input('start-date-picker', 'date'),
     Input('duration-dropdown', 'value'),
     Input('nuclear-slider-1', 'value'),
     Input('nuclear-slider-2', 'value')]
)
def update_graph(start_date, duration_days, nuc1, nuc2):
    # Collect nuclear fractions and convert to decimals
    nuclear_percentages = [nuc1, nuc2]
    nuclear_fractions = [x / 100 for x in nuclear_percentages]
    
    # Validate dates
    warning_message = ""
    date_info = ""
    
    empty_donut = go.Figure()
    empty_donut.update_layout(height=200, width=200, margin=dict(l=10, r=10, t=10, b=10))
    
    if start_date is None:
        return (go.Figure(), "Please select a start date", "", 
                "⚡ N/A", "⚡ N/A",
                empty_donut, empty_donut)
    
    # Convert to datetime
    start = pd.to_datetime(start_date)
    end = start + timedelta(days=duration_days)
    
    # Format dates for display
    start_str = start.strftime('%Y-%m-%d')
    end_str = end.strftime('%Y-%m-%d')
    
    # Check if end date exceeds available data
    if end > pd.to_datetime(max_date):
        end = pd.to_datetime(max_date)
        end_str = end.strftime('%Y-%m-%d')
        actual_days = (end - start).days
        warning_message = f"⚠️ Window extends beyond available data. Limited to {actual_days} days."
    
    # Check if start is before minimum
    if start < pd.to_datetime(min_date):
        start = pd.to_datetime(min_date)
        start_str = start.strftime('%Y-%m-%d')
        warning_message = f"⚠️ Start date adjusted to minimum: {start_str}"
    
    # Update date info
    actual_duration = (end - start).days
    date_info = f"📅 Analyzing: {start_str} to {end_str} ({actual_duration} days)"
    
    # Create figure
    try:
        fig, battery_capacities, installed_capacities = create_interactive_energy_plot(
            df_cf, 
            capacities_dict,
            colors, 
            nuclear_fractions,
            start_str, 
            end_str
        )
        
        # Capacities are already in the correct order
        capacity_1 = battery_capacities[0]
        capacity_2 = battery_capacities[1]
        
        # Format backup capacity displays
        backup_display_1 = f"⚡ Minimum Backup Peaker Plant/Storage requirement: {capacity_1:,.0f} MW"
        backup_display_2 = f"⚡ Minimum Backup Peaker Plant/Storage requirement: {capacity_2:,.0f} MW"
        
        # Create donut charts
        donut_1 = create_capacity_donut(installed_capacities[0], colors)
        donut_2 = create_capacity_donut(installed_capacities[1], colors)
        
        return (fig, warning_message, date_info, 
                backup_display_1, backup_display_2,
                donut_1, donut_2)
    except Exception as e:
        return (go.Figure(), f"⚠️ Error: {str(e)}", date_info, 
                "⚡ Error", "⚡ Error",
                empty_donut, empty_donut)


# Run the app
if __name__ == '__main__':
    app.run(debug=True, port=8051)
