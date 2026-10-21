const Search = {
    results: [],
    
    execute() {
        const input = document.getElementById('searchInput');
        if (!input) return;
        const query = input.value.trim().toLowerCase();
        const container = document.getElementById('search-results');
        
        if (!query) {
            container.innerHTML = '<div style="opacity:0.6; text-align:center; padding: 10px;">Enter a search term to find parts</div>';
            this.results = [];
            return;
        }
        
        this.results = Parser.modelGroup.children.filter(mesh => {
            const ud = mesh.userData;
            if (!ud) return false;
            const searchStr = `${ud.partNo || ''} ${ud.partName || ''} ${ud.grade || ''} ${ud.thickness || ''} ${ud.fileSource || ''}`.toLowerCase();
            return searchStr.includes(query);
        });
        
        this.render();
    },
    
    render() {
        const container = document.getElementById('search-results');
        if (!container) return;
        
        if (this.results.length === 0) {
            container.innerHTML = '<div style="opacity:0.6; text-align:center; padding: 10px;">No parts found matching your search.</div>';
            return;
        }
        
        const displayResults = this.results.slice(0, 200);
        let html = `<div style="font-size:11px; opacity:0.6; margin-bottom:4px; padding-left:2px;">Found ${this.results.length} parts ${this.results.length > 200 ? '(Showing first 200)' : ''}</div>`;
        
        displayResults.forEach(mesh => {
            const ud = mesh.userData;
            const title = ud.partNo || 'Unknown Part';
            
            const details = [];
            if (ud.thickness && ud.thickness !== 'NoThk') details.push(`${ud.thickness}mm`);
            if (ud.grade && ud.grade !== 'NoGrade') details.push(ud.grade);
            if (ud.fileSource) {
                details.push(ud.fileSource.replace(/\.[^/.]+$/, ''));
            }
            const sub = details.join(' • ');

            const isVisible = mesh.visible;
            const isSelected = Selection.selectedNodes.includes(mesh);
            
            html += `
                <div class="search-result-item ${isSelected ? 'selected' : ''}" onclick="Search.selectMesh('${mesh.uuid}')" ondblclick="Search.isolateMesh('${mesh.uuid}')">
                    <div class="search-result-info">
                        <span class="search-result-title">${title}</span>
                        <span class="search-result-sub">${sub}</span>
                    </div>
                    <div class="search-result-actions">
                        <span class="material-icons search-result-eye" onclick="event.stopPropagation(); Search.toggleVisibility('${mesh.uuid}')">${isVisible ? 'visibility' : 'visibility_off'}</span>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    },
    
    selectMesh(uuid) {
        const mesh = Parser.modelGroup.children.find(m => m.uuid === uuid);
        if (mesh) {
            if (!mesh.visible) this.toggleVisibility(uuid);
            
            Selection.clearSelection();
            Selection.addNode(mesh);
            
            this.render(); 
        }
    },
    
    isolateMesh(uuid) {
        const mesh = Parser.modelGroup.children.find(m => m.uuid === uuid);
        if (mesh) {
            App.isolateNode('part', mesh.uuid, mesh.userData.partName || 'Part', [mesh]);
            this.render();
        }
    },
    
    toggleVisibility(uuid) {
        const mesh = Parser.modelGroup.children.find(m => m.uuid === uuid);
        if (mesh) {
            const targetVisibility = !mesh.visible;
            mesh.visible = targetVisibility;
            
            mesh.children.forEach(child => {
                if (child.name === 'edges') child.visible = targetVisibility && ViewEngine.edgesVisible;
                if (child.name === 'sectionEdges') child.visible = targetVisibility && ViewEngine.sectionEdgesVisible && SectionManager.hasActiveClip();
            });
            
            if (window.dispatchEvent) {
                window.dispatchEvent(new Event('sceneStateChanged'));
            }
            if (typeof App !== 'undefined' && App.updateEdgeColors) App.updateEdgeColors();
            
            this.render();
        }
    },
    
    reset() {
        const input = document.getElementById('searchInput');
        if (input) input.value = '';
        
        Parser.modelGroup.children.forEach(mesh => {
            mesh.visible = true;
            mesh.children.forEach(child => {
                if (child.name === 'edges') child.visible = ViewEngine.edgesVisible;
                if (child.name === 'sectionEdges') child.visible = ViewEngine.sectionEdgesVisible && SectionManager.hasActiveClip();
            });
        });
        
        if (window.dispatchEvent) window.dispatchEvent(new Event('sceneStateChanged'));
        if (typeof App !== 'undefined' && App.updateEdgeColors) App.updateEdgeColors();
        
        Selection.clearSelection();
        Camera.zoomExtents();
        
        this.execute();
    }
};

window.addEventListener('pointerup', () => {
    if (document.getElementById('panel-search') && document.getElementById('panel-search').classList.contains('open')) {
        setTimeout(() => Search.render(), 50);
    }
});

window.Search = Search;
